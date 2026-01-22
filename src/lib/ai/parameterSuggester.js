import { geminiGenerateContent } from "./geminiClient";

function extractFirstJson(text) {
  if (!text) throw new Error("Empty Gemini response");

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("Gemini response did not contain JSON");
  }

  const candidate = text.slice(firstBrace, lastBrace + 1);
  return JSON.parse(candidate);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

export function validateAndNormalizeSuggestions(s) {
  const out = { ...s };

  const allowedDither = ["none", "ordered", "floyd-steinberg", "bayer"];
  if (!allowedDither.includes(out?.dithering?.method)) {
    out.dithering = { ...(out.dithering || {}), method: "floyd-steinberg" };
  }

  if (typeof out?.scaleFactor?.value !== "number") {
    out.scaleFactor = { ...(out.scaleFactor || {}), value: 1 };
  }
  out.scaleFactor.value = clamp(out.scaleFactor.value, 0.5, 2);

  if (typeof out?.preprocessing?.enabled !== "boolean") {
    out.preprocessing = { ...(out.preprocessing || {}), enabled: false };
  }

  out.preprocessing = {
    enabled: Boolean(out.preprocessing.enabled),
    blurPx: clamp(Number(out.preprocessing.blurPx ?? 0), 0, 6),
    sharpen: clamp(Number(out.preprocessing.sharpen ?? 0), 0, 100),
    brightness: clamp(Number(out.preprocessing.brightness ?? 100), 0, 200),
    contrast: clamp(Number(out.preprocessing.contrast ?? 100), 0, 200),
    saturation: clamp(Number(out.preprocessing.saturation ?? 100), 0, 200),
    reason: out.preprocessing.reason || null,
  };

  out.transparency = {
    enabled: Boolean(out?.transparency?.enabled),
    tolerance: clamp(Number(out?.transparency?.tolerance ?? 128), 0, 256),
    reason: out?.transparency?.reason || null,
  };

  out.supportBlocks = {
    where: out?.supportBlocks?.where || "all_optimized",
    supportBlock: out?.supportBlocks?.supportBlock || "cobblestone",
    reason: out?.supportBlocks?.reason || null,
  };

  out.dithering = {
    method: out.dithering.method,
    reason: out?.dithering?.reason || null,
  };

  out.scaleFactor = {
    value: out.scaleFactor.value,
    reason: out?.scaleFactor?.reason || null,
  };

  return out;
}

export async function suggestParameters({ originalAnalysis, previewAnalysis, currentParams, mode, iteration = 0 }) {
  const prompt =
    "You suggest parameter adjustments for generating Minecraft map art. " +
    "You MUST NOT change map size or block palette selection. " +
    "Return ONLY valid JSON.\n\n" +
    "Allowed dithering methods: none | ordered | floyd-steinberg | bayer\n" +
    "Scale factor range: 0.5..2 (float)\n" +
    "Preprocessing: enabled(boolean), blurPx(0..6), sharpen(0..100), brightness(0..200), contrast(0..200), saturation(0..200)\n" +
    "Transparency: enabled(boolean), tolerance(0..256) (only meaningful for mapdat; still output)\n" +
    "Support blocks where: none | important | all_optimized | all_double_optimized\n\n" +
    "Schema:\n" +
    "{\n" +
    "  dithering: { method: string, reason: string|null },\n" +
    "  scaleFactor: { value: number, reason: string|null },\n" +
    "  preprocessing: { enabled: boolean, blurPx: number, sharpen: number, brightness: number, contrast: number, saturation: number, reason: string|null },\n" +
    "  transparency: { enabled: boolean, tolerance: number, reason: string|null },\n" +
    "  supportBlocks: { where: string, supportBlock: string, reason: string|null }\n" +
    "}\n\n" +
    "Context:\n" +
    `mode: ${mode}\n` +
    `iteration: ${iteration}\n` +
    `currentParams: ${JSON.stringify(currentParams)}\n` +
    `originalAnalysis: ${JSON.stringify(originalAnalysis)}\n` +
    `previewAnalysis: ${JSON.stringify(previewAnalysis)}\n`;

  const { text } = await geminiGenerateContent({
    model: "gemini-2.0-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 700,
    },
  });

  const raw = extractFirstJson(text);
  return validateAndNormalizeSuggestions(raw);
}
