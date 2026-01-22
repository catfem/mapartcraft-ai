import { geminiGenerateContent } from "./geminiClient";

function dataUrlToInlineData(dataUrl) {
  const [header, base64] = dataUrl.split(",");
  const mimeMatch = /data:([^;]+);base64/.exec(header);
  return {
    mime_type: mimeMatch?.[1] || "image/png",
    data: base64,
  };
}

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

export async function analyzeOriginalImage({ imageDataUrl }) {
  const prompt =
    "You are analyzing an image for conversion into Minecraft map art. " +
    "Return ONLY valid JSON (no markdown, no explanations outside JSON).\n" +
    "Schema:\n" +
    "{\n" +
    "  composition: { subject: string|null, hasText: boolean, notes: string|null },\n" +
    "  colors: { dominantColors: string[], vibrancy: number, contrast: number },\n" +
    "  detail: { complexity: 'low'|'medium'|'high', fineDetails: boolean, notes: string|null }\n" +
    "}\n" +
    "Use 0..1 for vibrancy/contrast.";

  const { text } = await geminiGenerateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }, { inline_data: dataUrlToInlineData(imageDataUrl) }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
    },
  });

  return extractFirstJson(text);
}

export async function analyzeSchematicPreview({ originalImageDataUrl, previewImageDataUrl }) {
  const prompt =
    "You are evaluating a Minecraft map art preview against the original image. " +
    "Return ONLY valid JSON (no markdown).\n" +
    "Schema:\n" +
    "{\n" +
    "  metrics: { fidelity: number, colorAccuracy: number, detailPreservation: number, overall: number },\n" +
    "  issues: string[],\n" +
    "  positives: string[]\n" +
    "}\n" +
    "All metrics must be 0..1.";

  const { text } = await geminiGenerateContent({
    model: "gemini-2.0-flash",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt + "\nFirst image: ORIGINAL. Second image: PREVIEW." },
          { inline_data: dataUrlToInlineData(originalImageDataUrl) },
          { inline_data: dataUrlToInlineData(previewImageDataUrl) },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 512,
    },
  });

  return extractFirstJson(text);
}
