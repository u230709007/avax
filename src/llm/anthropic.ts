// docs: docs/llm.md
import Anthropic from "@anthropic-ai/sdk";

export const DECISION_MODEL = "claude-opus-5-5";
export const QUARANTINE_MODEL = "claude-haiku-5-5";
/** Opus 5.5 için sunucu tarafı refusal fallback ("default" biçimi bu beta başlığını ister). */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY tanımlı değil (.env)");
    client = new Anthropic();
  }
  return client;
}
