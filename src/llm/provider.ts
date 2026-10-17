// docs: docs/llm.md
export type LlmProvider = "anthropic" | "gemini";

/**
 * Hangi LLM sağlayıcısı kullanılacak? LLM_PROVIDER açıkça verilirse o; yoksa anahtarı olan.
 * Guardian güvenliği sağlayıcıdan bağımsızdır (ADR 006).
 */
export function llmProvider(): LlmProvider | undefined {
  const p = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (p === "anthropic" || p === "gemini") return p;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return undefined;
}
