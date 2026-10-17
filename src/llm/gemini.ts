// docs: docs/llm.md
import { GoogleGenAI } from "@google/genai";

/** Varsayılanlar: ücretsiz katmanda kullanılabilen "latest" takma adları. .env ile değiştirilebilir. */
export const GEMINI_DECISION_MODEL = () => process.env.GEMINI_MODEL ?? "gemini-flash-latest";
export const GEMINI_QUARANTINE_MODEL = () => process.env.GEMINI_QUARANTINE_MODEL ?? "gemini-flash-lite-latest";
/** Karar modelinin kotası dolunca denenecek model (ücretsiz katmanda kota model başınadır). Boş = yedek yok. */
export const GEMINI_FALLBACK_MODEL = () => process.env.GEMINI_FALLBACK_MODEL ?? "gemini-flash-lite-latest";

let client: GoogleGenAI | undefined;

export function gemini(): GoogleGenAI {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY tanımlı değil (.env)");
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

export interface GeminiFailure {
  status?: number;
  /** 429 ise: günlük kota mı (gün içinde tekrar denemek anlamsız) yoksa dakikalık mı. */
  quota?: "daily" | "minute";
  /** Sunucunun önerdiği bekleme (RetryInfo.retryDelay). */
  retryMs?: number;
}

/** @google/genai ApiError'ı: `status` + mesajın içinde Google'ın JSON hata gövdesi. */
export function classifyGeminiError(e: unknown): GeminiFailure {
  const status = (e as { status?: number }).status;
  const msg = e instanceof Error ? e.message : String(e);
  if (status !== 429 && !/RESOURCE_EXHAUSTED|"code":\s*429/.test(msg)) return { status };
  const delay = /"retryDelay":\s*"(\d+(?:\.\d+)?)s"/.exec(msg);
  return {
    status: 429,
    quota: /PerDay/i.test(msg) ? "daily" : "minute",
    retryMs: delay ? Math.ceil(Number(delay[1]) * 1000) : undefined,
  };
}

/** Kullanıcıya gösterilecek kısa Türkçe açıklama; ham JSON arayüze gitmez. */
export function describeGeminiError(e: unknown): string {
  const f = classifyGeminiError(e);
  if (f.quota === "daily") {
    return "Gemini ücretsiz günlük kotası doldu. Kota Pasifik saatiyle gece yarısı (TR 10:00) sıfırlanır. Şimdi devam etmek için: Google AI Studio'da faturalandırmayı aç, başka bir GEMINI_API_KEY kullan veya LLM_PROVIDER=anthropic yap. Otonom modu kapatmak kotayı korur.";
  }
  if (f.quota === "minute") {
    const s = f.retryMs ? ` ${Math.ceil(f.retryMs / 1000)} sn sonra` : " bir dakika sonra";
    return `Gemini dakikalık istek sınırı aşıldı;${s} tekrar dene. Otonom mod açıksa sohbetle aynı kotayı kullanır.`;
  }
  if (f.status && f.status >= 500) return `Gemini geçici olarak yanıt vermiyor (HTTP ${f.status}); biraz sonra tekrar dene.`;
  return `Gemini hatası: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]?.slice(0, 200) ?? ""}`;
}

/**
 * Dakikalık 429 ve 5xx için bekleyip tekrar dener (sunucunun önerdiği süre, en fazla 30 sn).
 * Günlük kota dolduysa beklemek işe yaramaz: hemen atar.
 */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const f = classifyGeminiError(e);
      const transient = f.quota === "minute" || (f.status !== undefined && f.status >= 500);
      if (!transient || i === attempts - 1) throw e;
      const wait = f.retryMs ?? 2000 * 2 ** i;
      if (wait > 30_000) throw e;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

/** Önce birincil modeli dener; kotası dolduysa (429) yedek modele geçer. */
export async function withModelFallback<T>(primary: string, fallback: string, fn: (model: string) => Promise<T>): Promise<T> {
  try {
    return await withRetry(() => fn(primary));
  } catch (e) {
    if (!fallback || fallback === primary || classifyGeminiError(e).status !== 429) throw e;
    return withRetry(() => fn(fallback));
  }
}
