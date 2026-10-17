// docs: docs/llm.md
import { EventEmitter } from "node:events";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { hasKey, llmProvider, PROVIDERS, setActiveProvider, type LlmProvider } from "../llm/provider.js";
import { ChatHost, type AgentHost } from "./host.js";
import { GeminiChatHost } from "./geminiHost.js";
import { GroqChatHost } from "./groqHost.js";

const EVENTS = ["llm_traffic", "assistant", "error"] as const;

/**
 * Arayüzden çalışma anında sağlayıcı değiştirilebilen host. Her sağlayıcı kendi guardian MCP sunucusuna
 * bağlanır (bir MCP sunucusu tek transport kabul eder). Hangi model seçilirse seçilsin tool'lar ve kurallar aynıdır.
 */
export class SwitchingHost extends EventEmitter implements AgentHost {
  private hosts = new Map<LlmProvider, AgentHost>();
  private current!: AgentHost;
  private currentId!: LlmProvider;

  constructor(private readonly newServer: () => Server) {
    super();
  }

  get label(): string {
    return this.current.label;
  }

  get provider(): LlmProvider {
    return this.currentId;
  }

  providers() {
    return PROVIDERS.map((p) => ({ id: p.id, label: p.label, available: hasKey(p.id), active: p.id === this.currentId }));
  }

  async connect(): Promise<void> {
    const p = llmProvider();
    if (!p) throw new Error("LLM anahtarı yok");
    await this.use(p);
  }

  /** Sağlayıcı değiştirir; sohbet geçmişi sağlayıcıya özeldir, yeni sağlayıcı temiz başlar. */
  async use(p: LlmProvider): Promise<void> {
    if (this.currentId === p) return;
    if (this.current?.isBusy()) throw new Error("Ajan şu an bir turu işliyor");
    setActiveProvider(p);
    let host = this.hosts.get(p);
    if (!host) {
      const server = this.newServer();
      host = p === "gemini" ? new GeminiChatHost(server) : p === "groq" ? new GroqChatHost(server) : new ChatHost(server);
      await host.connect();
      // Sadece aktif host'un olayları yansıtılır; dinleyicisi olmayan "error" fırlatmasın diye kontrol edilir.
      for (const ev of EVENTS) host.on(ev, (d) => this.current === host && this.listenerCount(ev) > 0 && this.emit(ev, d));
      this.hosts.set(p, host);
    }
    this.current = host;
    this.currentId = p;
  }

  chat(userText: string): Promise<string> {
    return this.current.chat(userText);
  }

  autonomousTick(): Promise<string> {
    return this.current.autonomousTick();
  }

  resetHistory(): void {
    this.current.resetHistory();
  }

  isBusy(): boolean {
    return this.current?.isBusy() ?? false;
  }
}
