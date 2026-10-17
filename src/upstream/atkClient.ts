// docs: docs/atk-integration.md
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/** Guardian'ın ATK'da kullanmasına izin verilen tool'lar. Geri kalan (transfer, earn, withdraw…) çağrılamaz. */
export const ATK_ALLOWED_TOOLS = Object.freeze([
  "market_get_ticker",
  "market_get_candles",
  "market_get_instruments",
  "account_get_balance",
  "account_get_positions",
  "account_get_bills",
  "spot_place_order",
  "spot_cancel_order",
  "spot_get_orders",
  "swap_place_order",
  "swap_cancel_order",
  "swap_get_orders",
  "swap_close_position",
  "swap_set_leverage",
  "news_get_latest",
  "news_get_by_coin",
] as const);
export type AtkToolName = (typeof ATK_ALLOWED_TOOLS)[number];

export class AtkError extends Error {
  constructor(
    readonly tool: string,
    message: string,
    readonly code = "ATK_ERROR",
  ) {
    super(message);
  }
}

export interface AtkToolDef {
  name: string;
  description: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
}

export interface OkxCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

export interface AtkOptions {
  profile: string;
  site: string;
  /**
   * Kişisel hesap (docs/tenants.md): anahtar sadece buradan gelir, sürecin HOME'u boş bir dizindir.
   * Böylece sahibin ~/.okx/config.toml'u, OAuth oturumu veya .env'deki OKX anahtarları asla okunmaz.
   */
  credentials?: OkxCredentials;
  home?: string;
}

/**
 * okx-trade-mcp'ye MCP stdio istemcisi. Her zaman --demo ile başlatılır ve sadece
 * gereken modüller yüklenir. Mock yoktur: bağlantı yoksa hata döner (fail-closed).
 */
export class AtkClient {
  private client: Client | undefined;
  private available = new Set<string>();
  private defs = new Map<string, AtkToolDef>();

  constructor(private readonly opts: AtkOptions) {}

  async connect(): Promise<void> {
    const require = createRequire(import.meta.url);
    const entry = require.resolve("@okx_ai/okx-trade-mcp/dist/index.js");
    // ATK sürecine sadece gerekli ortam değişkenleri geçer (ANTHROPIC_API_KEY, ANCHOR_PRIVATE_KEY vb. geçmez).
    // OKX anahtarları ya ~/.okx/config.toml'da ya da .env'deki OKX_API_KEY/OKX_SECRET_KEY/OKX_PASSPHRASE'de durur.
    const env: Record<string, string> = {};
    const own = this.opts.credentials;
    const pass = own ? ["PATH", "SYSTEMROOT", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE"] : ["HOME", "PATH", "USERPROFILE", "APPDATA", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "OKX_API_KEY", "OKX_SECRET_KEY", "OKX_PASSPHRASE"];
    for (const k of pass) {
      const v = process.env[k];
      if (v) env[k] = v;
    }
    if (own) {
      if (!this.opts.home) throw new AtkError("connect", "Kişisel ATK süreci için izole HOME gerekli", "ATK_UNAVAILABLE");
      mkdirSync(this.opts.home, { recursive: true });
      env.HOME = env.USERPROFILE = env.APPDATA = this.opts.home;
      env.OKX_API_KEY = own.apiKey;
      env.OKX_SECRET_KEY = own.secretKey;
      env.OKX_PASSPHRASE = own.passphrase;
    }
    env.OKX_DEMO = "1";
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        entry,
        "--profile", this.opts.profile,
        "--site", this.opts.site,
        "--modules", "market,spot,swap,account,news",
        "--demo",
      ],
      env,
      stderr: "pipe",
    });
    this.client = new Client({ name: "sealed-intent-guardian", version: "0.1.0" });
    await this.client.connect(transport);
    const { tools } = await this.client.listTools();
    this.available = new Set(tools.map((t) => t.name));
    this.defs = new Map(tools.map((t) => [t.name, { name: t.name, description: t.description ?? "", inputSchema: t.inputSchema as AtkToolDef["inputSchema"] }]));
  }

  /** Paketin gerçek tool tanımları (ATK uyumlu kapı bunları aynen yayınlar, docs/compat.md). Sadece allowlist'tekiler. */
  toolDefs(names: readonly string[]): AtkToolDef[] {
    return names.filter((n) => (ATK_ALLOWED_TOOLS as readonly string[]).includes(n)).flatMap((n) => this.defs.get(n) ?? []);
  }

  missingTools(): string[] {
    return ATK_ALLOWED_TOOLS.filter((t) => !this.available.has(t));
  }

  isConnected(): boolean {
    return this.client !== undefined;
  }

  /** ATK yanıtındaki OKX `data` alanını döner. */
  async call<T = unknown>(tool: AtkToolName, args: Record<string, unknown>): Promise<T> {
    if (!ATK_ALLOWED_TOOLS.includes(tool)) throw new AtkError(tool, "Tool allowlist dışında", "TOOL_NOT_ALLOWED");
    if (!this.client) throw new AtkError(tool, "ATK bağlı değil", "ATK_UNAVAILABLE");
    let result;
    try {
      result = await this.client.callTool({ name: tool, arguments: args });
    } catch (e) {
      throw new AtkError(tool, (e as Error).message, "ATK_UNAVAILABLE");
    }
    const first = (result.content as { type: string; text?: string }[] | undefined)?.[0];
    const payload = first?.type === "text" && first.text ? safeJson(first.text) : result.structuredContent;
    if (result.isError) {
      const msg = (payload as { message?: string } | undefined)?.message ?? "ATK hata döndü";
      throw new AtkError(tool, msg);
    }
    const data = (payload as { data?: unknown } | undefined)?.data;
    if (data && typeof data === "object" && "data" in (data as object)) return (data as { data: T }).data;
    return data as T;
  }

  async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
