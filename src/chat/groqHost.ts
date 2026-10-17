// docs: docs/llm.md
import { EventEmitter } from "node:events";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  describeGroqError,
  GROQ_DECISION_MODEL,
  GROQ_FALLBACK_MODEL,
  groqChat,
  groqWithFallback,
  type ChatMessage,
  type ChatRequest,
} from "../llm/groq.js";
import { AUTONOMOUS_TASK, callGuardianTool, connectGuardian, safeJson, SYSTEM_PROMPT, type AgentHost } from "./host.js";

const MAX_STEPS = 12;

/**
 * (A) modunun Groq host'u. Diğer host'larla aynı sözleşme: tool'lar sadece MCP üzerinden
 * guardian'a gider, aynı olaylar (llm_traffic, assistant, error) yayılır.
 */
export class GroqChatHost extends EventEmitter implements AgentHost {
  readonly label = `Groq (${GROQ_DECISION_MODEL()})`;
  private mcp: Client | undefined;
  private tools: NonNullable<ChatRequest["tools"]> = [];
  private history: ChatMessage[] = [];
  private busy = false;

  constructor(
    private readonly guardianServer: Server,
    private readonly complete: (req: ChatRequest) => ReturnType<typeof groqChat> = groqChat,
  ) {
    super();
  }

  async connect(): Promise<void> {
    const { client, tools } = await connectGuardian(this.guardianServer, "guardian-groq-host");
    this.mcp = client;
    this.tools = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema } }));
  }

  isBusy(): boolean {
    return this.busy;
  }

  async chat(userText: string): Promise<string> {
    return this.run(this.history, userText, "chat");
  }

  async autonomousTick(): Promise<string> {
    return this.run([], AUTONOMOUS_TASK, "autonomous");
  }

  resetHistory(): void {
    this.history = [];
  }

  private async run(messages: ChatMessage[], userText: string, mode: "chat" | "autonomous"): Promise<string> {
    if (!this.mcp) throw new Error("GroqChatHost bağlı değil");
    if (this.busy) throw new Error("Ajan şu an başka bir turu işliyor");
    this.busy = true;
    try {
      messages.push({ role: "user", content: userText });
      let finalText = "";
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await groqWithFallback(GROQ_DECISION_MODEL(), GROQ_FALLBACK_MODEL(), (model) =>
          this.complete({
            model,
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
            tools: this.tools,
            temperature: 0.2,
          }),
        );
        const choice = res.choices[0];
        if (!choice) {
          finalText = "Model yanıt vermedi.";
          break;
        }
        const { content, tool_calls } = choice.message;
        // Sadece role/content/tool_calls geri gönderilir (gpt-oss'un `reasoning` alanı geçmişe girmez).
        messages.push({ role: "assistant", content: content ?? null, ...(tool_calls?.length ? { tool_calls } : {}) });
        if (content?.trim()) finalText = content.trim();
        if (!tool_calls?.length) break;

        for (const call of tool_calls) {
          const name = call.function.name;
          const parsed = safeJson(call.function.arguments || "{}");
          const args = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
          this.emit("llm_traffic", { direction: "from_llm", tool: name, payload: args, ts: Date.now() });
          const { text } = await callGuardianTool(this.mcp, name, args);
          this.emit("llm_traffic", { direction: "to_llm", tool: name, payload: safeJson(text), ts: Date.now() });
          messages.push({ role: "tool", tool_call_id: call.id, content: text });
        }
      }
      this.emit("assistant", { text: finalText, mode, ts: Date.now() });
      return finalText;
    } catch (e) {
      if (mode === "chat") this.history = [];
      const message = describeGroqError(e);
      this.emit("error", { message, ts: Date.now() });
      throw new Error(message, { cause: e });
    } finally {
      this.busy = false;
    }
  }
}
