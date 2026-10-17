// docs: docs/llm.md
import { EventEmitter } from "node:events";
import type { Content, FunctionDeclaration } from "@google/genai";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { gemini, GEMINI_DECISION_MODEL, withRetry } from "../llm/gemini.js";
import { AUTONOMOUS_TASK, callGuardianTool, connectGuardian, safeJson, SYSTEM_PROMPT, type AgentHost } from "./host.js";

const MAX_STEPS = 12;

/**
 * (A) modunun Gemini host'u. Anthropic host'uyla aynı sözleşme: tool'lar sadece MCP üzerinden
 * guardian'a gider, aynı olaylar (llm_traffic, assistant, error) yayılır.
 */
export class GeminiChatHost extends EventEmitter implements AgentHost {
  readonly label = `Gemini (${GEMINI_DECISION_MODEL()})`;
  private mcp: Client | undefined;
  private declarations: FunctionDeclaration[] = [];
  private history: Content[] = [];
  private busy = false;

  constructor(private readonly guardianServer: Server) {
    super();
  }

  async connect(): Promise<void> {
    const { client, tools } = await connectGuardian(this.guardianServer, "guardian-gemini-host");
    this.mcp = client;
    this.declarations = tools.map((t) => ({ name: t.name, description: t.description ?? "", parametersJsonSchema: t.inputSchema }));
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

  private async run(contents: Content[], userText: string, mode: "chat" | "autonomous"): Promise<string> {
    if (!this.mcp) throw new Error("GeminiChatHost bağlı değil");
    if (this.busy) throw new Error("Ajan şu an başka bir turu işliyor");
    this.busy = true;
    try {
      contents.push({ role: "user", parts: [{ text: userText }] });
      let finalText = "";
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await withRetry(() =>
          gemini().models.generateContent({
            model: GEMINI_DECISION_MODEL(),
            contents,
            config: { systemInstruction: SYSTEM_PROMPT, tools: [{ functionDeclarations: this.declarations }] },
          }),
        );
        const cand = res.candidates?.[0];
        if (!cand?.content) {
          finalText = `Model yanıt vermedi (${cand?.finishReason ?? res.promptFeedback?.blockReason ?? "bilinmiyor"}).`;
          break;
        }
        // Model içeriği (düşünce imzaları dahil) değiştirilmeden geçmişe eklenir.
        contents.push(cand.content);
        if (res.text?.trim()) finalText = res.text.trim();
        const calls = res.functionCalls ?? [];
        if (!calls.length) break;

        const parts: NonNullable<Content["parts"]> = [];
        for (const call of calls) {
          const name = call.name ?? "";
          const args = (call.args ?? {}) as Record<string, unknown>;
          this.emit("llm_traffic", { direction: "from_llm", tool: name, payload: args, ts: Date.now() });
          const { text } = await callGuardianTool(this.mcp, name, args);
          const payload = safeJson(text);
          this.emit("llm_traffic", { direction: "to_llm", tool: name, payload, ts: Date.now() });
          parts.push({
            functionResponse: {
              id: call.id,
              name,
              response: payload && typeof payload === "object" ? (payload as Record<string, unknown>) : { output: payload },
            },
          });
        }
        contents.push({ role: "user", parts });
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
