// docs: docs/llm.md
import { EventEmitter } from "node:events";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { withRetry } from "../llm/gemini.js";
import { GROQ_DECISION_MODEL, groqChat, type GroqMessage, type GroqTool } from "../llm/groq.js";
import { AUTONOMOUS_TASK, callGuardianTool, connectGuardian, safeJson, SYSTEM_PROMPT, type AgentHost } from "./host.js";

const MAX_STEPS = 12;

/**
 * (A) modunun Groq host'u. Diğer host'larla aynı sözleşme: tool'lar sadece MCP üzerinden
 * guardian'a gider, aynı olaylar (llm_traffic, assistant, error) yayılır.
 */
export class GroqChatHost extends EventEmitter implements AgentHost {
  readonly label = `Groq (${GROQ_DECISION_MODEL()})`;
  private mcp: Client | undefined;
  private tools: GroqTool[] = [];
  private history: GroqMessage[] = [];
  private busy = false;

  constructor(private readonly guardianServer: Server) {
    super();
  }

  async connect(): Promise<void> {
    const { client, tools } = await connectGuardian(this.guardianServer, "guardian-groq-host");
    this.mcp = client;
    this.tools = tools.map((t) => {
      const { $schema: _drop, ...parameters } = t.inputSchema as Record<string, unknown>;
      return { type: "function", function: { name: t.name, description: t.description ?? "", parameters } };
    });
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

  private async run(messages: GroqMessage[], userText: string, mode: "chat" | "autonomous"): Promise<string> {
    if (!this.mcp) throw new Error("GroqChatHost bağlı değil");
    if (this.busy) throw new Error("Ajan şu an başka bir turu işliyor");
    this.busy = true;
    try {
      messages.push({ role: "user", content: userText });
      let finalText = "";
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await withRetry(() =>
          groqChat({
            model: GROQ_DECISION_MODEL(),
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
            tools: this.tools,
          }),
        );
        const msg = res.choices[0]?.message;
        if (!msg) {
          finalText = `Model yanıt vermedi (${res.choices[0]?.finish_reason ?? "bilinmiyor"}).`;
          break;
        }
        messages.push({ role: "assistant", content: msg.content ?? null, ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}) });
        if (msg.content?.trim()) finalText = msg.content.trim();
        const calls = msg.tool_calls ?? [];
        if (!calls.length) break;

        for (const call of calls) {
          const name = call.function.name;
          const parsed = safeJson(call.function.arguments || "{}");
          const args = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
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
      this.emit("error", { message: (e as Error).message.slice(0, 300), ts: Date.now() });
      throw e;
    } finally {
      this.busy = false;
    }
  }
}
