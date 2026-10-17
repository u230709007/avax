// docs: docs/compat.md
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Guardian, ToolResult } from "../guardian.js";
import type { Policy } from "../config/policy.js";
import type { Store } from "../store/db.js";
import type { Vault } from "../masking/vault.js";
import type { AuditLog } from "../audit/log.js";
import type { ToolMeter } from "../mcpServer.js";
import { AtkError, type AtkClient, type AtkToolDef, type AtkToolName } from "../upstream/atkClient.js";
import { AtkTools } from "../upstream/atkTools.js";
import type { App } from "../bootstrap.js";
import { TradeIntentSchema } from "../policy/intent.js";
import { AtkOrderSchema, translateAtkOrder } from "./translate.js";

/** Herkese açık piyasa verisi: ATK'ya aynen gider. */
const MARKET_READS = ["market_get_ticker", "market_get_candles", "market_get_instruments"] as const;
/** Hesap okuma: policy.compat.accountReads "raw" değilse yayınlanmaz ve reddedilir. */
const ACCOUNT_READS = ["account_get_balance", "account_get_positions", "spot_get_orders", "swap_get_orders"] as const;
const NEWS = ["news_get_latest", "news_get_by_coin"] as const;
/** ATK'da olmayan, guardian'ın eklediği tarama tool'ları: ajan dış içeriği ve kullanıcı mesajını buradan geçirir. */
const GUARDIAN_EXTRAS: AtkToolDef[] = [
  {
    name: "read_url",
    description:
      "[Guardian] Web sayfasını guardian üzerinden oku. Sayfa taranır (gizli metin, görünmez karakter, Mors/base64/hex, talimat kalıpları); temizse arındırılmış metin, değilse sadece bayraklar döner. Okuma sonrası işlemler daha sıkı denetlenir.",
    inputSchema: { type: "object", properties: { url: { type: "string", description: "http(s) URL" } }, required: ["url"] },
  },
  {
    name: "inspect_prompt",
    description:
      "[Guardian] Kullanıcı mesajını (yapıştırılmış içerik dahil) LLM'e vermeden önce tara. Kodlanmış içerik engellenir; talimat/gizli metin bulunursa sonraki işlemler onaya düşer.",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  },
];
const ORDERS = ["spot_place_order", "swap_place_order"] as const;
const RISK_REDUCING = ["spot_cancel_order", "swap_cancel_order", "swap_close_position"] as const;
export const COMPAT_TOOLS = [...MARKET_READS, ...ACCOUNT_READS, ...NEWS, ...ORDERS, "swap_set_leverage", ...RISK_REDUCING] as const;
const NewsArgs = z.object({ coins: z.string().max(200).optional() }).passthrough();

export interface CompatDeps {
  guardian: Guardian;
  policy: Policy;
  store: Store;
  vault: Vault;
  audit: AuditLog;
  upstream: Pick<AtkClient, "call" | "toolDefs">;
  atk: Pick<AtkTools, "lastPrice" | "instrument" | "closePosition" | "cancelOrder">;
}

const LeverageSchema = z
  .object({
    instId: z.string().max(40),
    lever: z.union([z.string(), z.number()]).transform(Number).pipe(z.number().int().positive()),
    mgnMode: z.enum(["cross", "isolated"]),
    posSide: z.enum(["long", "short"]).optional(),
  })
  .strict();
const CancelSchema = z.object({ instId: z.string().max(40), ordId: z.string().max(40).optional(), clOrdId: z.string().max(32).optional() }).strict();
const CloseSchema = z
  .object({
    instId: z.string().max(40),
    mgnMode: z.enum(["cross", "isolated"]),
    posSide: z.enum(["long", "short", "net"]).optional(),
    autoCxl: z.boolean().optional(),
    clOrdId: z.string().max(32).optional(),
  })
  .strict();

type Reply = { isError?: boolean; payload: Record<string, unknown>; status: string };

const ok = (tool: string, data: unknown, guardian?: ToolResult): Reply => ({
  payload: { tool, ok: true, data: { endpoint: "guardian", requestTime: new Date().toISOString(), data }, ...(guardian ? { guardian } : {}) },
  status: String(guardian?.status ?? "OK"),
});
const err = (tool: string, code: string, message: string, guardian?: ToolResult): Reply => ({
  isError: true,
  payload: { tool, ok: false, error: { type: "GuardianRejected", code, message }, ...(guardian ? { guardian } : {}) },
  status: "REJECTED",
});

/**
 * ATK uyumlu kapı: ATK için yazılmış ajan aynı tool adları ve şemalarla bağlanır, guardian araya girer.
 * Emirler TradeIntent'e çevrilip Guardian.proposeIntent'ten geçer; allowlist dışı her şey reddedilir ve audit'e düşer.
 */
export class AtkCompat {
  constructor(private readonly d: CompatDeps) {}

  /** Ajanın gördüğü tool listesi: gerçek ATK şemaları, açıklamaya guardian notu eklenmiş. */
  tools(): AtkToolDef[] {
    const names = COMPAT_TOOLS.filter((n) => this.d.policy.compat.accountReads === "raw" || !(ACCOUNT_READS as readonly string[]).includes(n));
    const real = new Map(this.d.upstream.toolDefs(names).map((t) => [t.name, t]));
    const atk = names.map((name) => {
      const t = real.get(name) ?? { name, description: "", inputSchema: { type: "object" as const } };
      return { ...t, description: `[Guardian korumalı] ${this.note(name)} ${t.description}`.trim() };
    });
    return [...atk, ...GUARDIAN_EXTRAS];
  }

  private note(name: string): string {
    if ((ORDERS as readonly string[]).includes(name))
      return `Emri guardian üretir: IOC, ±%${this.d.policy.priceBandPct} fiyat bandı, policy limitleri, zincir kaydı; ordId maskelidir (ORD_…).`;
    if ((NEWS as readonly string[]).includes(name))
      return this.d.policy.compat.contentReads === "sanitized"
        ? "Her haber taranır: temizse arındırılmış metin, bayraklıysa sadece bayraklar döner."
        : "Ham haber yerine karantinadan geçmiş şemalı özet döner.";
    if (name === "swap_set_leverage") return `En fazla ${this.d.policy.maxLeverage}x; emirle birlikte uygulanır.`;
    return "";
  }

  async call(tool: string, args: Record<string, unknown>): Promise<Reply> {
    if (!this.d.policy.compat.enabled) return err(tool, "COMPAT_DISABLED", "ATK uyumlu kapı kapalı");
    const exposed = this.tools().some((t) => t.name === tool);
    if (!exposed) return this.reject(tool, { keys: Object.keys(args) }, "TOOL_NOT_ALLOWED", "Bu tool guardian'da yok (transfer/çekim/earn/bot kapalı)");
    try {
      if ((MARKET_READS as readonly string[]).includes(tool) || (ACCOUNT_READS as readonly string[]).includes(tool)) {
        const data = await this.d.upstream.call(tool as AtkToolName, args);
        if ((ACCOUNT_READS as readonly string[]).includes(tool)) this.d.audit.append({ source: "llm", tool, input: args, outcome: "OK" });
        return ok(tool, data);
      }
      if ((NEWS as readonly string[]).includes(tool)) {
        const coins = NewsArgs.safeParse(args).data?.coins?.split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z0-9]{2,10}$/.test(c));
        const digest =
          this.d.policy.compat.contentReads === "sanitized" ? await this.d.guardian.newsInspected(coins) : await this.d.guardian.getNewsDigest();
        return ok(tool, digest.items, { status: "OK", source: digest.source, count: digest.count });
      }
      if (tool === "read_url") {
        const r = this.d.policy.compat.contentReads === "sanitized" ? await this.d.guardian.readUrlInspected(args) : await this.d.guardian.readUrl(args);
        return r.status === "REJECTED" ? err(tool, String(r.code), String(r.code), r) : ok(tool, [r], { status: "OK" });
      }
      if (tool === "inspect_prompt") {
        const r = this.d.guardian.inspectPrompt(String(args.text ?? ""));
        return r.delivered ? ok(tool, [r], { status: "OK" }) : err(tool, "CHAT_INPUT_BLOCKED", "Mesaj kodlanmış içerik taşıyor; LLM'e verilmemeli", r);
      }
      if (tool === "spot_place_order" || tool === "swap_place_order") return await this.placeOrder(tool, args);
      if (tool === "swap_set_leverage") return this.setLeverage(args);
      if (tool === "swap_close_position") return await this.closePosition(args);
      return await this.cancelOrder(tool as "spot_cancel_order" | "swap_cancel_order", args);
    } catch (e) {
      return this.reject(tool, args, e instanceof AtkError ? e.code : "GUARDIAN_ERROR", (e as Error).message);
    }
  }

  private allowedInst(instId: string, market: "spot" | "swap"): string | undefined {
    const pair = this.d.vault.pairTokenForInstId(instId);
    return pair && this.d.policy.pairs[pair]?.[market] === instId ? pair : undefined;
  }

  private async placeOrder(tool: "spot_place_order" | "swap_place_order", args: Record<string, unknown>): Promise<Reply> {
    const market = tool === "spot_place_order" ? "spot" : "swap";
    const parsed = AtkOrderSchema.safeParse(args);
    if (!parsed.success) return this.reject(tool, args, "SCHEMA_INVALID", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const o = parsed.data;
    const pair = this.allowedInst(o.instId, market);
    if (!pair) return this.reject(tool, args, "INSTRUMENT_NOT_ALLOWED", o.instId);

    let refPrice: number, usdtAvail: number, baseAvail: number, ctVal = 1;
    try {
      const s = await this.d.guardian.snapshot(true);
      usdtAvail = s.holdings.find((h) => h.ccy === "USDT")?.avail ?? 0;
      baseAvail = s.holdings.find((h) => h.ccy === o.instId.split("-")[0])?.avail ?? 0;
      refPrice = await this.d.atk.lastPrice(o.instId);
      if (market === "swap") ctVal = (await this.d.atk.instrument(o.instId, "SWAP")).ctVal;
    } catch (e) {
      return this.reject(tool, args, "STATE_UNAVAILABLE", (e as Error).message);
    }
    const leverage = market === "swap" ? Number(this.d.store.getKv(`compat:lever:${o.instId}`) ?? 1) || 1 : 1;
    const t = translateAtkOrder(market, pair, o, { refPrice, usdtAvail, baseAvail, ctVal, leverage });
    if (!t.ok) return this.reject(tool, args, t.code, t.detail);
    const intent = TradeIntentSchema.safeParse(t.intent);
    if (!intent.success) return this.reject(tool, args, "SCHEMA_INVALID", intent.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

    const res = await this.d.guardian.proposeIntent(intent.data, tool, { atk: o, intent: intent.data, notes: t.notes });
    if (res.status === "ALLOWED")
      return ok(tool, [{ ordId: res.ord_id, clOrdId: "", sCode: "0", sMsg: String(res.message ?? "") }], { ...res, notes: t.notes });
    if (res.status === "PENDING_APPROVAL")
      return ok(tool, [{ ordId: "", clOrdId: "", sCode: "PENDING_APPROVAL", sMsg: String(res.message ?? "") }], res);
    const failed = (res.failed_rules as string[] | undefined)?.join("; ");
    return err(tool, String(res.code), failed ?? String(res.code), res);
  }

  private setLeverage(args: Record<string, unknown>): Reply {
    const tool = "swap_set_leverage";
    const p = LeverageSchema.safeParse(args);
    if (!p.success) return this.reject(tool, args, "SCHEMA_INVALID", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    if (!this.allowedInst(p.data.instId, "swap")) return this.reject(tool, args, "INSTRUMENT_NOT_ALLOWED", p.data.instId);
    if (p.data.lever > this.d.policy.maxLeverage) return this.reject(tool, args, "LEVERAGE_EXCEEDED", `${p.data.lever}x > ${this.d.policy.maxLeverage}x`);
    this.d.store.setKv(`compat:lever:${p.data.instId}`, String(p.data.lever));
    this.d.audit.append({ source: "llm", tool, input: p.data, outcome: "ALLOWED" });
    return ok(tool, [{ instId: p.data.instId, lever: String(p.data.lever), mgnMode: "isolated", posSide: "" }], {
      status: "ALLOWED",
      message: "Kaldıraç kaydedildi; guardian bir sonraki emirde isolated olarak uygular.",
    });
  }

  private async closePosition(args: Record<string, unknown>): Promise<Reply> {
    const tool = "swap_close_position";
    const p = CloseSchema.safeParse(args);
    if (!p.success) return this.reject(tool, args, "SCHEMA_INVALID", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    if (!this.allowedInst(p.data.instId, "swap")) return this.reject(tool, args, "INSTRUMENT_NOT_ALLOWED", p.data.instId);
    // Kapatma riski azaltır: kill-switch / günlük zarar durumunda da serbest (guardian.closePosition ile aynı).
    await this.d.atk.closePosition(p.data.instId, p.data.mgnMode, p.data.posSide);
    this.d.audit.append({ source: "llm", tool, input: p.data, outcome: "ALLOWED" });
    void this.d.guardian.snapshot(true).catch(() => undefined);
    return ok(tool, [{ instId: p.data.instId, posSide: p.data.posSide ?? "net" }], { status: "ALLOWED" });
  }

  private async cancelOrder(tool: "spot_cancel_order" | "swap_cancel_order", args: Record<string, unknown>): Promise<Reply> {
    const market = tool === "spot_cancel_order" ? "spot" : "swap";
    const p = CancelSchema.safeParse(args);
    if (!p.success) return this.reject(tool, args, "SCHEMA_INVALID", p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    if (!this.allowedInst(p.data.instId, market)) return this.reject(tool, args, "INSTRUMENT_NOT_ALLOWED", p.data.instId);
    const ordId = p.data.ordId;
    if (ordId && /^ORD_[0-9a-f]{8}$/.test(ordId)) {
      const res = await this.d.guardian.cancelOrder({ ord_id: ordId });
      return res.status === "ALLOWED" ? ok(tool, [{ ordId, sCode: "0", sMsg: "" }], res) : err(tool, String(res.code), String(res.code), res);
    }
    if (!ordId || this.d.policy.compat.accountReads !== "raw")
      return this.reject(tool, args, "MASKING_VIOLATION", "İptal için guardian'ın döndürdüğü ORD_… kimliği gerekir");
    await this.d.atk.cancelOrder(market, p.data.instId, ordId);
    this.d.audit.append({ source: "llm", tool, input: p.data, outcome: "ALLOWED" });
    return ok(tool, [{ ordId, sCode: "0", sMsg: "" }], { status: "ALLOWED" });
  }

  private reject(tool: string, input: unknown, code: string, message: string): Reply {
    this.d.audit.append({ source: "llm", tool, input, outcome: "REJECTED", code, detail: message });
    return err(tool, code, message, { status: "REJECTED", code });
  }
}

/** Çalışan uygulamanın bağımlılıklarıyla kapı (servis /atk ve stdio --atk aynı kurulumu kullanır). */
export function atkCompatFor(app: App): AtkCompat {
  return new AtkCompat({
    guardian: app.guardian,
    policy: app.guardian.policy,
    store: app.store,
    vault: app.vault,
    audit: app.audit,
    upstream: app.atk,
    atk: new AtkTools(app.atk),
  });
}

/** ATK uyumlu MCP sunucusu (her istemciye ayrı örnek, LEARN L-014). */
export function createAtkCompatServer(compat: AtkCompat, meter?: ToolMeter): Server {
  const server = new Server({ name: "sealed-intent-guardian-atk", version: "0.1.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: compat.tools() }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = req.params.name;
    const quota = meter?.before(tool);
    if (quota) return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(err(tool, quota, quota).payload) }] };
    const r = await compat.call(tool, (req.params.arguments ?? {}) as Record<string, unknown>);
    meter?.after(tool, r.status);
    return { ...(r.isError ? { isError: true } : {}), content: [{ type: "text" as const, text: JSON.stringify(r.payload) }] };
  });
  return server;
}
