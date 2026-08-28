import type { AltTextTone } from "./tone-options";
import { LANGUAGE_OPTIONS, type AltTextLanguage } from "./language-options";

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const LANGUAGE_NAMES: Record<string, string> = Object.fromEntries(
  LANGUAGE_OPTIONS.map((option) => [option.value, option.label]),
);

/** Free, no-AI fallback: combines product fields into simple alt text. */
export function generateTemplateAltText(input: {
  productTitle?: string | null;
  productVendor?: string | null;
  targetKeywords?: string | null;
}): { altText: string } {
  const parts = [input.productTitle?.trim(), input.productVendor?.trim()].filter(Boolean);
  const keyword = input.targetKeywords?.split(",")[0]?.trim();
  if (keyword) parts.push(keyword);
  return { altText: parts.join(" — ") || "Product photo" };
}

function buildPrompt(input: {
  productTitle?: string | null;
  tone: AltTextTone;
  language: AltTextLanguage;
  brandDescription?: string | null;
  includeBrandName: boolean;
  targetKeywords?: string | null;
  forbiddenWords?: string | null;
}): string {
  const languageName = LANGUAGE_NAMES[input.language] ?? input.language;
  const lines: string[] = [
    "You are an accessibility and SEO expert writing image alt text for a Shopify store.",
    "Look at the image and describe what it shows, concisely and accurately.",
  ];

  if (input.productTitle) lines.push(`The image belongs to this product: "${input.productTitle}".`);
  if (input.includeBrandName && input.brandDescription?.trim()) {
    lines.push(`Brand context: ${input.brandDescription.trim().slice(0, 300)}`);
  }

  lines.push(
    "",
    "Requirements:",
    `- Write entirely in ${languageName}.`,
    `- Tone: ${input.tone}.`,
    "- 8 to 125 characters, one sentence, no trailing period.",
    "- Describe the actual visual content — do not invent details you can't see.",
    "- Do not start with \"Image of\" or \"Picture of\".",
  );

  if (input.targetKeywords?.trim()) {
    lines.push(`- Naturally include these keywords where relevant: ${input.targetKeywords.trim()}.`);
  }
  if (input.forbiddenWords?.trim()) {
    lines.push(`- Never use these words: ${input.forbiddenWords.trim()}.`);
  }

  lines.push(`- Respond with ONLY a JSON object of the exact shape: {"altText": "..."}`);

  return lines.join("\n");
}

async function fetchImageAsBase64(imageUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`[alt-text-generator] Failed to fetch image ${imageUrl}: ${response.status}`);
      return null;
    }
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (contentLength > MAX_IMAGE_BYTES) {
      console.error(`[alt-text-generator] Image too large: ${imageUrl}`);
      return null;
    }
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      console.error(`[alt-text-generator] Image too large after download: ${imageUrl}`);
      return null;
    }
    const base64 = Buffer.from(buffer).toString("base64");
    return { base64, mimeType };
  } catch (error) {
    console.error(`[alt-text-generator] Error fetching image ${imageUrl}:`, error);
    return null;
  }
}

export async function generateAltText(input: {
  imageUrl: string;
  productTitle?: string | null;
  tone: AltTextTone;
  language: AltTextLanguage;
  brandDescription?: string | null;
  includeBrandName: boolean;
  targetKeywords?: string | null;
  forbiddenWords?: string | null;
}): Promise<{ altText: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const image = await fetchImageAsBase64(input.imageUrl);
  if (!image) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(input) },
              { inlineData: { mimeType: image.mimeType, data: image.base64 } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(`[alt-text-generator] Gemini request failed: ${response.status} ${response.statusText} — ${errorBody}`);
      return null;
    }

    const data = await response.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error(`[alt-text-generator] Gemini response had no text: ${JSON.stringify(data)}`);
      return null;
    }

    const parsed = JSON.parse(text);
    const altText = typeof parsed?.altText === "string" ? parsed.altText.trim() : "";
    if (!altText) {
      console.error(`[alt-text-generator] Gemini JSON missing altText: ${text}`);
      return null;
    }

    return { altText };
  } catch (error) {
    console.error(`[alt-text-generator] Gemini call threw:`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
