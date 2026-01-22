const DEFAULT_MODEL = "gemini-2.0-flash";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let lastRequestTs = 0;
let queue = Promise.resolve();

export function getGeminiApiKey() {
  // MapartCraft currently uses Create React App (CRA). CRA only exposes env vars that start with REACT_APP_.
  // The ticket requests VITE_GEMINI_API_KEY, so we support both names.
  return process.env.REACT_APP_GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || null;
}

export function hasGeminiApiKey() {
  return Boolean(getGeminiApiKey());
}

async function rateLimit(minIntervalMs) {
  const now = Date.now();
  const waitMs = Math.max(0, minIntervalMs - (now - lastRequestTs));
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  lastRequestTs = Date.now();
}

function getErrorMessageFromResponseBody(body) {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body.error?.message) return body.error.message;
  return null;
}

export async function geminiGenerateContent({
  model = DEFAULT_MODEL,
  apiKey = getGeminiApiKey(),
  contents,
  generationConfig,
  minIntervalMs = 1100,
  maxRetries = 3,
}) {
  if (!apiKey) {
    throw new Error("Missing Gemini API key. Set REACT_APP_GEMINI_API_KEY (CRA) or VITE_GEMINI_API_KEY.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Ensure we only do one request at a time in the browser to avoid rate-limit spikes.
  queue = queue.then(async () => {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      await rateLimit(minIntervalMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents,
            generationConfig,
          }),
        });

        const body = await res.json().catch(() => null);

        if (!res.ok) {
          const msg = getErrorMessageFromResponseBody(body) || `Gemini request failed with status ${res.status}`;

          if ([429, 500, 502, 503, 504].includes(res.status) && attempt < maxRetries) {
            await sleep(500 * Math.pow(2, attempt));
            lastErr = new Error(msg);
            continue;
          }
          throw new Error(msg);
        }

        const parts = body?.candidates?.[0]?.content?.parts;
        const text = Array.isArray(parts) ? parts.map((p) => p.text || "").join("") : "";
        return { text, raw: body };
      } catch (err) {
        lastErr = err;
        if (attempt < maxRetries) {
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
      }
    }

    throw lastErr || new Error("Gemini request failed");
  });

  return queue;
}
