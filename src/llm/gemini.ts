// docs: docs/llm.md
import { GoogleGenAI } from "@google/genai";

/** Varsayılanlar: ücretsiz katmanda kullanılabilen "latest" takma adları. .env ile değiştirilebilir. */
export const GEMINI_DECISION_MODEL = () => process.env.GEMINI_MODEL ?? "gemini-flash-latest";
export const GEMINI_QUARANTINE_MODEL = () => process.env.GEMINI_QUARANTINE_MODEL ?? "gemini-flash-lite-latest";

let client: GoogleGenAI | undefined;

export function gemini(): GoogleGenAI {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY tanımlı değil (.env)");
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

/** 429 (ücretsiz katman kotası) ve 5xx için kısa bekleyip bir kez daha dener. */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const status = (e as { status?: number }).status;
      if (status !== 429 && !(status && status >= 500)) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
  throw last;
}
