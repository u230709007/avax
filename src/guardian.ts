// docs: docs/WORKFLOW.md
import { EventEmitter } from "node:events";
import type { Policy } from "./config/policy.js";
import type { Store } from "./store/db.js";
import type { Vault } from "./masking/vault.js";
import type { AuditLog } from "./audit/log.js";
import type { AvalancheGuard, ChainSnapshot } from "./chain/avalanche.js";
import type { Approvals, ApprovalSummary } from "./approval/human.js";
import type { AtkTools, OkxBalanceDetail, OkxPosition } from "./upstream/atkTools.js";
import { AtkError } from "./upstream/atkClient.js";
import { sanitize, type SanitizeResult } from "./ingest/sanitize.js";
import type { DigestItem } from "./llm/quarantine.js";
import { CancelOrderSchema, ClosePositionSchema, ReadUrlSchema, TradeIntentSchema, type TradeIntent } from "./policy/intent.js";
import { evaluate, type Verdict } from "./policy/engine.js";
import type { TradeContext } from "./policy/rules.js";
import { ema, rsi } from "./market/indicators.js";

export type QuarantineFn = (text: string, flags: SanitizeResult["flags"]) => Promise<DigestItem[]>;

export interface GuardianDeps {
  policy: Policy;
  store: Store;
  vault: Vault;
  audit: AuditLog;
  chain: AvalancheGuard;
  approvals: Approvals;
  atk: AtkTools;
  quarantine: QuarantineFn;
  readUrlAllowlist: string[];
  fetchImpl?: typeof fetch;
}

/** Guardian'ın LLM'e döndürdüğü her şey maskelidir ve JSON'a çevrilebilir. */
export type ToolResult = Record<string, unknown>;

/** Gerçek portföy anlık görüntüsü — sadece sunucuda ve arayüzün gerçek değer panelinde kullanılır. */
export interface PortfolioSnapshot {
  ts: number;
  totalEqUsd: number;
  holdings: { ccy: string; eq: number; avail: number; eqUsd: number }[];
  positions: OkxPosition[];
  dayStartEqUsd: number;
  dailyPnlPct: number;
}

const SNAPSHOT_TTL_MS = 5_000;

function round(n: number, step: number): number {
  if (!Number.isFinite(step) || step <= 0) return n;
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return Number((Math.floor(n / step + 1e-9) * step).toFixed(decimals));
}

function roundPx(n: number, tick: number): string {
  const decimals = Number.isFinite(tick) && tick > 0 ? Math.max(0, -Math.floor(Math.log10(tick))) : 8;
  return (Math.round(n / tick) * tick).toFixed(decimals);
}

/**
 * Deterministik guardian: LLM'in 7 dar tool'unun tek uygulayıcısı.
 * Gelen yönde ATK verisini maskeler, giden yönde her isteği kurallardan geçirir.
 */
export class Guardian extends EventEmitter {
  private snap: PortfolioSnapshot | undefined;

  constructor(private readonly d: GuardianDeps) {
    super();
  }

  get policy(): Policy {
    return this.d.policy;
  }

  // ───────────────────────── okuma: gerçek veri (sunucu içi) ─────────────────────────

  async snapshot(force = false): Promise<PortfolioSnapshot> {
    if (!force && this.snap && Date.now() - this.snap.ts < SNAPSHOT_TTL_MS) return this.snap;
    const [bal, positions] = await Promise.all([this.d.atk.balance(), this.d.atk.positions()]);
    if (!Number.isFinite(bal.totalEqUsd)) throw new AtkError("account_get_balance", "Bakiye okunamadı");
    const holdings = bal.details
      .map((h: OkxBalanceDetail) => ({ ccy: h.ccy, eq: Number(h.eq), avail: Number(h.availBal), eqUsd: Number(h.eqUsd) }))
      .filter((h) => h.eq > 0);
    const day = new Date().toISOString().slice(0, 10);
    const key = `dayStartEq:${day}`;
    let dayStart = Number(this.d.store.getKv(key));
    if (!Number.isFinite(dayStart) || dayStart <= 0) {
      dayStart = bal.totalEqUsd;
      this.d.store.setKv(key, String(dayStart));
    }
    const dailyPnlPct = dayStart > 0 ? ((bal.totalEqUsd - dayStart) / dayStart) * 100 : 0;
    this.snap = { ts: Date.now(), totalEqUsd: bal.totalEqUsd, holdings, positions, dayStartEqUsd: dayStart, dailyPnlPct };
    this.refreshDisplayTags(this.snap);
    this.emit("portfolio", this.snap);
    return this.snap;
  }

  private refreshDisplayTags(s: PortfolioSnapshot): void {
    const fmt = (n: number, digits = 2) => n.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    this.d.vault.setDisplay("BAL:TOTAL", `${fmt(s.totalEqUsd)} USD`);
    for (const h of s.holdings) this.d.vault.setDisplay(`BAL:${h.ccy}`, `${fmt(h.eq, h.ccy === "USDT" ? 2 : 6)} ${h.ccy}`);
    this.d.vault.setDisplay("PNL", `${s.dailyPnlPct >= 0 ? "+" : ""}${fmt(s.dailyPnlPct)}%`);
    for (const p of s.positions) {
      const tok = this.d.vault.tokenize("POS", p.posId, { instId: p.instId, mgnMode: p.mgnMode, posSide: p.posSide });
      this.d.vault.setDisplay(`POS:${tok}`, `${fmt(Number(p.upl))} USDT`);
    }
  }

  /** Arayüz grafiği için gerçek bakiye hareketleri (LLM'e gitmez). */
  async bills() {
    return this.d.atk.bills(100);
  }

  async chainState(force = false): Promise<ChainSnapshot> {
    const s = await this.d.chain.state(force);
    this.emit("chain", s);
    return s;
  }

  // ───────────────────────── LLM tool'ları ─────────────────────────

  async getMarketView(): Promise<ToolResult> {
    const pairs = [];
    for (const [token, p] of Object.entries(this.d.policy.pairs)) {
      try {
        const candles = await this.d.atk.closes(p.spot, "15m", 100);
        const closes = candles.map((c) => c.close);
        const price = closes.at(-1);
        const e20 = ema(closes, 20);
        const e50 = ema(closes, 50);
        const first = closes.at(-97) ?? closes[0];
        pairs.push({
          pair: token,
          symbol: p.spot.split("-")[0],
          price,
          change_24h_pct: price !== undefined && first ? Number((((price - first) / first) * 100).toFixed(2)) : null,
          rsi14_15m: closes.length ? Number(rsi(closes, 14)?.toFixed(1)) : null,
          ema20_15m: e20 ?? null,
          ema50_15m: e50 ?? null,
          trend: e20 !== undefined && e50 !== undefined ? (e20 > e50 ? "up" : "down") : "unknown",
        });
      } catch (e) {
        pairs.push({ pair: token, error: e instanceof AtkError ? e.code : "MARKET_UNAVAILABLE" });
      }
    }
    const result = { bar: "15m", pairs };
    this.d.audit.append({ source: "llm", tool: "get_market_view", input: {}, outcome: "OK" });
    return result;
  }

  async getPortfolioView(): Promise<ToolResult> {
    const s = await this.snapshot();
    const chain = await this.chainState();
    const volume = this.d.store.volumeSince(Date.now() - 86_400_000);
    const masked = {
      total: { bucket: this.d.vault.bucket(s.totalEqUsd), display: "{{BAL:TOTAL}}" },
      holdings: s.holdings.map((h) => ({
        asset: h.ccy,
        bucket: this.d.vault.bucket(h.eqUsd),
        share_pct: s.totalEqUsd > 0 ? Math.round((h.eqUsd / s.totalEqUsd) * 20) * 5 : 0,
        display: `{{BAL:${h.ccy}}}`,
      })),
      positions: s.positions
        .filter((p) => this.d.vault.pairTokenForInstId(p.instId))
        .map((p) => {
          const tok = this.d.vault.tokenize("POS", p.posId, { instId: p.instId, mgnMode: p.mgnMode, posSide: p.posSide });
          return {
            pos_id: tok,
            pair: this.d.vault.pairTokenForInstId(p.instId),
            side: Number(p.pos) >= 0 ? "long" : "short",
            leverage: Number(p.lever),
            pnl: Number(p.upl) >= 0 ? "profit" : "loss",
            display: `{{POS:${tok}}}`,
          };
        }),
      daily_pnl: { sign: s.dailyPnlPct >= 0 ? "up" : "down", display: "{{PNL}}" },
      limits: {
        max_order_pct_of_balance: this.d.policy.maxOrderPctOfBalance,
        max_leverage_swap: this.d.policy.maxLeverage,
        rolling_24h_used_pct: Math.round((volume / this.d.policy.rolling24hMaxUsdt) * 100),
        trading_enabled: chain.reachable && chain.policyHashMatches && !chain.paused,
      },
    };
    this.d.audit.append({ source: "llm", tool: "get_portfolio_view", input: {}, outcome: "OK" });
    return masked;
  }

  async getNewsDigest(): Promise<ToolResult> {
    const coins = Object.values(this.d.policy.pairs).map((p) => p.spot.split("-")[0]!);
    const articles = await this.d.atk.news(coins, 10);
    const parts: string[] = [];
    const flags = new Set<SanitizeResult["flags"][number]>();
    const decoded: SanitizeResult["decoded"] = [];
    for (const a of articles) {
      const s = sanitize([a.title, a.summary ?? a.content].filter(Boolean).join("\n"));
      s.flags.forEach((f) => flags.add(f));
      decoded.push(...s.decoded);
      parts.push(`### item\n${s.text}`);
    }
    const items = parts.length ? await this.d.quarantine(parts.join("\n\n"), [...flags]) : [];
    const result = { source: "okx_news", count: articles.length, items };
    this.d.audit.append({
      source: "llm",
      tool: "get_news_digest",
      input: {},
      outcome: flags.size ? "WARNING" : "OK",
      code: flags.size ? [...flags].join(",") : undefined,
      detail: { items, decoded },
    });
    return result;
  }

  async readUrl(raw: unknown): Promise<ToolResult> {
    const parsed = ReadUrlSchema.safeParse(raw);
    if (!parsed.success) return this.reject("read_url", raw, "SCHEMA_INVALID", parsed.error.issues[0]?.message);
    const url = new URL(parsed.data.url);
    if (!["http:", "https:"].includes(url.protocol) || !this.d.readUrlAllowlist.includes(url.hostname)) {
      return this.reject("read_url", { host: url.hostname }, "HOST_NOT_ALLOWED", url.hostname);
    }
    let body: string;
    let isHtml = false;
    try {
      const res = await (this.d.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      const ct = res.headers.get("content-type") ?? "";
      if (!/text\/|html|json/.test(ct)) return this.reject("read_url", { url: url.href }, "CONTENT_TYPE_NOT_ALLOWED", ct);
      isHtml = ct.includes("html");
      body = (await res.text()).slice(0, 2_000_000);
    } catch (e) {
      return this.reject("read_url", { url: url.href }, "FETCH_FAILED", (e as Error).message);
    }
    const s = sanitize(body, { isHtml });
    const items = await this.d.quarantine(s.text, s.flags);
    const allFlags = [...new Set(items.flatMap((i) => i.flags))];
    this.d.audit.append({
      source: "llm",
      tool: "read_url",
      input: { url: url.href },
      outcome: allFlags.length ? "WARNING" : "OK",
      code: allFlags.length ? allFlags.join(",") : undefined,
      detail: { items, decoded: s.decoded },
    });
    return { url: url.href, items };
  }

  /** İşlem önerisi: şema → maske → bağlam → kurallar → (onay) → yürütme. */
  async proposeTrade(raw: unknown): Promise<ToolResult> {
    const leaks = this.d.vault.scanForLeaks(raw);
    if (leaks.length) return this.reject("propose_trade", raw, "MASKING_VIOLATION", leaks);
    const parsed = TradeIntentSchema.safeParse(raw);
    if (!parsed.success) return this.reject("propose_trade", raw, "SCHEMA_INVALID", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    const intent = parsed.data;
    if (!this.d.policy.pairs[intent.pair]) return this.reject("propose_trade", intent, "INSTRUMENT_NOT_ALLOWED", intent.pair);

    const ctx = await this.buildContext(intent);
    const verdict = evaluate(ctx, this.d.policy);
    if (!verdict.allowed) return this.reject("propose_trade", intent, verdict.code!, verdict.results);

    if (verdict.needsHumanApproval) {
      const summary = this.summarize(ctx, verdict);
      const approval = this.d.approvals.create(intent, summary);
      this.d.audit.append({ source: "llm", tool: "propose_trade", input: intent, outcome: "PENDING_APPROVAL", code: approval.id, detail: verdict.results });
      return {
        status: "PENDING_APPROVAL",
        approval_id: approval.id,
        message: "İşlem kullanıcı onayı bekliyor. Onay yalnızca kullanıcı arayüzünden verilebilir.",
      };
    }
    return this.execute(ctx, verdict, "llm");
  }

  /** Arayüzden gelen insan onayı: kurallar taze bağlamla yeniden çalışır. */
  async approve(id: string): Promise<ToolResult> {
    const a = this.d.approvals.get(id);
    if (!a || a.status !== "pending") return { status: "REJECTED", code: "APPROVAL_NOT_PENDING", approval_id: id };
    this.d.approvals.setStatus(id, "approved");
    const ctx = await this.buildContext(a.intent);
    const verdict = evaluate(ctx, this.d.policy);
    if (!verdict.allowed) {
      this.d.approvals.setStatus(id, "failed");
      return this.reject("approve", { approval_id: id }, verdict.code!, verdict.results, "human");
    }
    const res = await this.execute(ctx, verdict, "human", id);
    this.d.approvals.setStatus(id, res.status === "ALLOWED" ? "executed" : "failed");
    return res;
  }

  rejectApproval(id: string): ToolResult {
    const a = this.d.approvals.get(id);
    if (!a || a.status !== "pending") return { status: "REJECTED", code: "APPROVAL_NOT_PENDING" };
    this.d.approvals.setStatus(id, "rejected");
    this.d.audit.append({ source: "human", tool: "approve", input: { approval_id: id }, outcome: "REJECTED", code: "HUMAN_REJECTED" });
    return { status: "REJECTED", code: "HUMAN_REJECTED" };
  }

  async closePosition(raw: unknown): Promise<ToolResult> {
    const parsed = ClosePositionSchema.safeParse(raw);
    if (!parsed.success) return this.reject("close_position", raw, "SCHEMA_INVALID");
    const pos = this.d.vault.resolve(parsed.data.pos_id, "POS");
    const instId = pos?.meta?.instId as string | undefined;
    if (!pos || !instId || !this.d.vault.pairTokenForInstId(instId)) return this.reject("close_position", raw, "MASKING_VIOLATION", "bilinmeyen pos_id");
    try {
      // Kapatma riski azaltır: zincir/kill-switch/günlük zarar durumunda da serbest.
      await this.d.atk.closePosition(instId, String(pos.meta?.mgnMode ?? "isolated"), pos.meta?.posSide as string | undefined);
    } catch (e) {
      return this.reject("close_position", raw, e instanceof AtkError ? e.code : "ATK_ERROR", (e as Error).message);
    }
    this.d.audit.append({ source: "llm", tool: "close_position", input: parsed.data, outcome: "ALLOWED" });
    void this.snapshot(true).catch(() => undefined);
    return { status: "ALLOWED", pos_id: parsed.data.pos_id };
  }

  async cancelOrder(raw: unknown): Promise<ToolResult> {
    const parsed = CancelOrderSchema.safeParse(raw);
    if (!parsed.success) return this.reject("cancel_order", raw, "SCHEMA_INVALID");
    const ord = this.d.vault.resolve(parsed.data.ord_id, "ORD");
    const instId = ord?.meta?.instId as string | undefined;
    const market = ord?.meta?.market as "spot" | "swap" | undefined;
    if (!ord || !instId || !market) return this.reject("cancel_order", raw, "MASKING_VIOLATION", "bilinmeyen ord_id");
    try {
      await this.d.atk.cancelOrder(market, instId, ord.real);
    } catch (e) {
      return this.reject("cancel_order", raw, e instanceof AtkError ? e.code : "ATK_ERROR", (e as Error).message);
    }
    this.d.audit.append({ source: "llm", tool: "cancel_order", input: parsed.data, outcome: "ALLOWED" });
    return { status: "ALLOWED", ord_id: parsed.data.ord_id };
  }

  /** Otonom döngünün gerekçe notu (arayüzde "Ajan kararı" satırı). */
  agentNote(text: string): void {
    const leaks = this.d.vault.scanForLeaks(text);
    this.d.audit.append({
      source: "llm",
      tool: "agent_note",
      input: {},
      outcome: leaks.length ? "WARNING" : "OK",
      code: leaks.length ? "MASKING_VIOLATION" : undefined,
      detail: { text: text.slice(0, 2000) },
    });
  }

  // ───────────────────────── iç işleyiş ─────────────────────────

  private async buildContext(intent: TradeIntent): Promise<TradeContext> {
    const instId = this.d.vault.resolvePair(intent.pair, intent.market);
    const chain = await this.chainState();
    const now = Date.now();
    let refPrice: number | undefined;
    let notional = 0;
    let total = 0;
    let dailyPnlPct: number | undefined;
    try {
      const s = await this.snapshot(true);
      total = s.totalEqUsd;
      dailyPnlPct = s.dailyPnlPct;
      if (instId) {
        refPrice = await this.d.atk.lastPrice(instId);
        const usdtAvail = s.holdings.find((h) => h.ccy === "USDT")?.avail ?? 0;
        const pct = intent.size_pct / 100;
        if (intent.market === "spot") {
          if (intent.side === "buy") notional = usdtAvail * pct;
          else {
            const base = instId.split("-")[0];
            const avail = s.holdings.find((h) => h.ccy === base)?.avail ?? 0;
            notional = avail * pct * (refPrice || 0);
          }
        } else {
          notional = usdtAvail * pct * intent.leverage;
        }
      }
    } catch {
      // ATK okunamazsa bağlam eksik kalır; kurallar PRICE_UNAVAILABLE / STATE_UNAVAILABLE ile reddeder.
    }
    return {
      intent,
      instId,
      refPrice,
      notionalUsdt: Number(notional.toFixed(4)),
      totalEquityUsdt: total,
      volume24hUsdt: this.d.store.volumeSince(now - 86_400_000),
      ordersLastMinute: this.d.store.ordersSince(now - 60_000),
      dailyPnlPct,
      chain,
    };
  }

  private summarize(ctx: TradeContext, v: Verdict): ApprovalSummary {
    return {
      instId: ctx.instId!,
      market: ctx.intent.market,
      side: ctx.intent.side,
      notionalUsdt: ctx.notionalUsdt,
      leverage: ctx.intent.leverage,
      slPct: ctx.intent.sl_pct,
      tpPct: ctx.intent.tp_pct,
      rules: v.results.map((r) => ({ rule: r.rule, ok: r.ok, detail: r.detail })),
    };
  }

  /** Emir parametrelerini LLM değil bu fonksiyon üretir. */
  private async execute(ctx: TradeContext, v: Verdict, source: "llm" | "human", approvalId?: string): Promise<ToolResult> {
    const { intent } = ctx;
    const instId = ctx.instId!;
    const ref = ctx.refPrice!;
    const band = this.d.policy.priceBandPct / 100;
    const buy = intent.side === "buy";
    const params: Record<string, unknown> = { instId, side: intent.side, ordType: "ioc" };
    try {
      const inst = await this.d.atk.instrument(instId, intent.market === "spot" ? "SPOT" : "SWAP");
      const px = buy ? ref * (1 + band) : ref * (1 - band);
      params.px = roundPx(px, inst.tickSz);
      if (intent.market === "spot") {
        params.tdMode = "cash";
        const sz = round(ctx.notionalUsdt / px, inst.lotSz);
        if (!(sz >= inst.minSz)) return this.reject("propose_trade", intent, "SIZE_BELOW_MIN", { sz, minSz: inst.minSz }, source);
        params.sz = String(sz);
      } else {
        params.tdMode = "isolated";
        const contracts = round(ctx.notionalUsdt / (px * inst.ctVal), inst.lotSz);
        if (!(contracts >= inst.minSz)) return this.reject("propose_trade", intent, "SIZE_BELOW_MIN", { contracts, minSz: inst.minSz }, source);
        params.sz = String(contracts);
        await this.d.atk.setLeverage(instId, intent.leverage, "isolated");
      }
      if (intent.sl_pct !== undefined) {
        const sl = buy ? ref * (1 - intent.sl_pct / 100) : ref * (1 + intent.sl_pct / 100);
        params.slTriggerPx = roundPx(sl, inst.tickSz);
        params.slOrdPx = "-1";
      }
      if (intent.tp_pct !== undefined) {
        const tp = buy ? ref * (1 + intent.tp_pct / 100) : ref * (1 - intent.tp_pct / 100);
        params.tpTriggerPx = roundPx(tp, inst.tickSz);
        params.tpOrdPx = "-1";
      }
      const ack = await this.d.atk.placeOrder(intent.market, params);
      // Hacim, dolum beklenmeden muhafazakâr biçimde kaydedilir.
      this.d.store.recordFill(Date.now(), instId, ctx.notionalUsdt);
      const ordToken = this.d.vault.tokenize("ORD", ack.ordId, { instId, market: intent.market });
      this.d.audit.append({
        source,
        tool: approvalId ? "approve" : "propose_trade",
        input: approvalId ? { approval_id: approvalId, ...intent } : intent,
        outcome: "ALLOWED",
        code: ordToken,
        detail: { rules: v.results, order: { ...params, ordId: undefined } },
      });
      void this.snapshot(true).catch(() => undefined);
      return { status: "ALLOWED", ord_id: ordToken, message: "Emir OKX'e iletildi (IOC, fiyat bantlı)." };
    } catch (e) {
      return this.reject("propose_trade", intent, e instanceof AtkError ? e.code : "ATK_ERROR", (e as Error).message, source);
    }
  }

  private reject(tool: string, input: unknown, code: string, detail?: unknown, source: "llm" | "human" = "llm"): ToolResult {
    // Maskeleme ihlalinde ham girdi audit'e de yazılmaz; sadece ihlal türü yazılır.
    const safeInput = code === "MASKING_VIOLATION" ? { redacted: true } : input;
    this.d.audit.append({ source, tool, input: safeInput, outcome: "REJECTED", code, detail });
    const failed = Array.isArray(detail)
      ? (detail as { ok?: boolean; rule?: string; detail?: string }[]).filter((r) => r.ok === false).map((r) => `${r.rule}: ${r.detail}`)
      : undefined;
    return { status: "REJECTED", code, ...(failed?.length ? { failed_rules: failed } : {}) };
  }
}
