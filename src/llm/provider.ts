// docs: docs/llm.md
export type LlmProvider = "anthropic" | "gemini" | "groq";

export const PROVIDERS: { id: LlmProvider; label: string; keyEnv: string }[] = [
  { id: "groq", label: "Groq", keyEnv: "GROQ_API_KEY" },
  { id: "gemini", label: "Gemini", keyEnv: "GEMINI_API_KEY" },
  { id: "anthropic", label: "Claude", keyEnv: "ANTHROPIC_API_KEY" },
];

export const hasKey = (p: LlmProvider) => Boolean(process.env[PROVIDERS.find((x) => x.id === p)!.keyEnv]?.trim());

/** Çalışma anında arayüzden seçilen sağlayıcı (sağ üst seçici). Sadece anahtarı olan seçilebilir. */
let active: LlmProvider | undefined;

export function setActiveProvider(p: LlmProvider): void {
  if (!hasKey(p)) throw new Error(`${p} için API anahtarı yok`);
  active = p;
}

/**
 * Hangi LLM sağlayıcısı kullanılacak? Arayüzde seçilen; yoksa LLM_PROVIDER; yoksa anahtarı olan
 * (Groq → Gemini → Anthropic). Guardian güvenliği sağlayıcıdan bağımsızdır (ADR 006).
 */
export function llmProvider(): LlmProvider | undefined {
  if (active && hasKey(active)) return active;
  const p = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (p === "anthropic" || p === "gemini" || p === "groq") return p;
  return PROVIDERS.find((x) => hasKey(x.id))?.id;
}

/** Testler için: arayüz seçimini sıfırlar. */
export function resetActiveProvider(): void {
  active = undefined;
}
