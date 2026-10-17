// docs: docs/llm.md
/** Groq OpenAI uyumlu Chat Completions API'si. SDK yok, düz fetch. */
export const GROQ_DECISION_MODEL = () => process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
export const GROQ_QUARANTINE_MODEL = () => process.env.GROQ_QUARANTINE_MODEL ?? "openai/gpt-oss-20b";

const URL = "https://api.groq.com/openai/v1/chat/completions";

export interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type GroqMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: GroqToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface GroqTool {
  type: "function";
  function: { name: string; description: string; parameters: unknown };
}

export interface GroqResponse {
  choices: { message: { content: string | null; tool_calls?: GroqToolCall[] }; finish_reason: string }[];
}

export async function groqChat(body: {
  model: string;
  messages: GroqMessage[];
  tools?: GroqTool[];
  response_format?: { type: "json_object" };
  temperature?: number;
}): Promise<GroqResponse> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY tanımlı değil (.env)");
  const res = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // withRetry 429/5xx'i status alanından tanır.
    throw Object.assign(new Error(`Groq ${res.status}: ${text.slice(0, 300)}`), { status: res.status });
  }
  return (await res.json()) as GroqResponse;
}
