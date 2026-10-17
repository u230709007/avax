// docs: docs/WORKFLOW.md
import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import { keccak256, toBytes, type Hex } from "viem";
import type { Policy } from "./config/policy.js";
import type { Store } from "./store/db.js";
import type { Vault } from "./masking/vault.js";
import type { AuditLog } from "./audit/log.js";
import { IntentCommitError, type AvalancheGuard, type ChainSnapshot } from "./chain/avalanche.js";
import type { Approvals, ApprovalSummary } from "./approval/human.js";
import type { AtkTools, OkxBalanceDetail, OkxPosition } from "./upstream/atkTools.js";
import { AtkError } from "./upstream/atkClient.js";
import { inspectUntrusted, sanitize, sanitizeChatInput, type InspectedContent, type SanitizeResult } from "./ingest/sanitize.js";
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
 * Bayraklı öğe (gizli metin, kodlama, talimat, adres, karantina hatası) karar LLM'ine yön veremez:
 * duygusu kod tarafından nötr/0 yapılır. Karantina modeli kandırılmış olsa bile sahte "positive 0.99" geçmez.
 */
export function neutralizeFlagged(items: DigestItem[]): DigestItem[] {
  return items.map((it) => (it.flags.length ? { ...it, sentiment: "neutral", score: 0 } : it));
}

/** `*` her host'u açar ama loopback, özel ağ ve link-local IP'leri değil (SSRF). DNS ile özel IP'ye çözülen ad yine risktir. */
export function hostAllowed(host: string, allowlist: string[]): boolean {
  if (allowlist.includes(host)) return true;
  if (!allowlist.includes("*")) return false;
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (h.includes(":")) return false; // IPv6 literal: hepsi kapalı
  return true;
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
    this.markUntrusted("get_news_digest", flags.size > 0);
    const rawItems = parts.length ? await this.d.quarantine(parts.join("\n\n"), [...flags]) : [];
    const items = neutralizeFlagged(rawItems);
    if (items.some((i) => i.flags.length)) this.markUntrusted("get_news_digest", true);
    const result = { source: "okx_news", count: articles.length, items };
    this.d.audit.append({
      source: "llm",
      tool: "get_news_digest",
      input: {},
      outcome: flags.size ? "WARNING" : "OK",
      code: flags.size ? [...flags].join(",") : undefined,
      detail: { items, rawItems, decoded },
    });
    return result;
  }

  /** İzinli sayfayı çeker; ret durumunda audit'e yazılmış ToolResult döner. `*` allowlist'i loopback/özel IP hariç her host'u açar. */
  private async fetchPage(raw: unknown): Promise<{ url: URL; body: string; isHtml: boolean } | { rejected: ToolResult }> {
    const parsed = ReadUrlSchema.safeParse(raw);
    if (!parsed.success) return { rejected: this.reject("read_url", raw, "SCHEMA_INVALID", parsed.error.issues[0]?.message) };
    const url = new URL(parsed.data.url);
    if (!["http:", "https:"].includes(url.protocol) || !hostAllowed(url.hostname, this.d.readUrlAllowlist)) {
      return { rejected: this.reject("read_url", { host: url.hostname }, "HOST_NOT_ALLOWED", url.hostname) };
    }
    try {
      const res = await (this.d.fetchImpl ?? fetch)(url, { signal: AbortSignal.timeout(10_000), redirect: "error" });
      const ct = res.headers.get("content-type") ?? "";
      if (!/text\/|html|json/.test(ct)) return { rejected: this.reject("read_url", { url: url.href }, "CONTENT_TYPE_NOT_ALLOWED", ct) };
      return { url, body: (await res.text()).slice(0, 2_000_000), isHtml: ct.includes("html") };
    } catch (e) {
      return { rejected: this.reject("read_url", { url: url.href }, "FETCH_FAILED", (e as Error).message) };
    }
  }

  async readUrl(raw: unknown): Promise<ToolResult> {
    const page = await this.fetchPage(raw);
    if ("rejected" in page) return page.rejected;
    const { url, body, isHtml } = page;
    const s = sanitize(body, { isHtml });
    this.markUntrusted("read_url", true);
    const rawItems = await this.d.quarantine(s.text, s.flags);
    const items = neutralizeFlagged(rawItems);
    const allFlags = [...new Set(items.flatMap((i) => i.flags))];
    this.d.audit.append({
      source: "llm",
      tool: "read_url",
      input: { url: url.href },
      outcome: allFlags.length ? "WARNING" : "OK",
      code: allFlags.length ? allFlags.join(",") : undefined,
      detail: { items, rawItems, decoded: s.decoded },
    });
    return { url: url.href, items };
  }

  // ───────────── ATK uyumlu kapı: "sanitized" içerik görünümü (docs/compat.md) ─────────────
  // LLM ham içeriği görür ama önce guardian tarar: bayraklı içeriğin metni gitmez, her okuma taint başlatır ve audit'e düşer.

  /** Web sayfası: tarandıktan sonra temizse arındırılmış metin, değilse sadece bayraklar. */
  async readUrlInspected(raw: unknown): Promise<ToolResult> {
    const page = await this.fetchPage(raw);
    if ("rejected" in page) return page.rejected;
    const c = inspectUntrusted(page.body, { isHtml: page.isHtml });
    this.markUntrusted("read_url", true);
    this.auditInspection("read_url", { url: page.url.href }, [c]);
    return { url: page.url.href, ...this.view(c) };
  }

  /** OKX haberleri: her öğe ayrı taranır; bayraklı öğe başlığıyla birlikte gizlenir. */
  async newsInspected(coins?: string[]): Promise<ToolResult> {
    const list = coins?.length ? coins : Object.values(this.d.policy.pairs).map((p) => p.spot.split("-")[0]!);
    const articles = await this.d.atk.news(list, 10);
    const checked = articles.map((a) => inspectUntrusted([a.title, a.summary ?? a.content].filter(Boolean).join("\n")));
    this.markUntrusted("get_news_digest", checked.some((c) => c.flags.length > 0));
    this.auditInspection("news", { coins: list }, checked);
    return {
      source: "okx_news",
      count: articles.length,
      items: checked.map((c, i) => ({ ...(c.delivered ? { title: articles[i]!.title ?? "" } : {}), ...this.view(c) })),
    };
  }

  /**
   * Kullanıcının ajana gönderdiği mesaj (host entegrasyonu çağırır). Kullanıcı güvenilir, yapıştırdığı içerik değil:
   * kodlanmış içerik engellenir; talimat/gizli metin varsa sıkı taint başlar (sonraki işlem onaya düşer).
   */
  inspectPrompt(text: string): ToolResult {
    const r = sanitizeChatInput(String(text).slice(0, 50_000));
    if (r.flags.length) this.markUntrusted("user_prompt", true);
    this.d.audit.append({
      source: "llm",
      tool: "inspect_prompt",
      input: { length: String(text).length },
      outcome: r.blocked ? "REJECTED" : r.flags.length ? "WARNING" : "OK",
      code: r.blocked ? "CHAT_INPUT_BLOCKED" : r.flags.length ? r.flags.join(",") : undefined,
      detail: { decoded: r.decoded },
    });
    return r.blocked ? { delivered: false, flags: r.flags, reason: "CHAT_INPUT_BLOCKED" } : { delivered: true, text: r.text, flags: r.flags };
  }

  private view(c: InspectedContent): ToolResult {
    return c.delivered ? { delivered: true, text: c.text, flags: c.flags } : { delivered: false, flags: c.flags, reason: "CONTENT_BLOCKED" };
  }

  private auditInspection(tool: string, input: unknown, items: InspectedContent[]): void {
    const flags = [...new Set(items.flatMap((c) => c.flags))];
    const blocked = items.filter((c) => !c.delivered).length;
    this.d.audit.append({
      source: "llm",
      tool,
      input,
      outcome: flags.length ? "WARNING" : "OK",
      code: flags.length ? flags.join(",") : undefined,
      detail: { items: items.length, blocked, decoded: items.flatMap((c) => c.decoded) },
    });
  }

  /** İşlem önerisi: şema → maske → bağlam → kurallar → (onay) → yürütme. */
  async proposeTrade(raw: unknown): Promise<ToolResult> {
    const leaks = this.d.vault.scanForLeaks(raw);
    if (leaks.length) return this.reject("propose_trade", raw, "MASKING_VIOLATION", leaks);
    const parsed = TradeIntentSchema.safeParse(raw);
    if (!parsed.success) return this.reject("propose_trade", raw, "SCHEMA_INVALID", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
    return this.proposeIntent(parsed.data);
  }

  /**
   * Ortak karar hattı: kurallar → (onay) → yürütme. `propose_trade` ve ATK uyumlu kapı (src/compat, docs/compat.md) buradan geçer.
   * `intent` şemadan geçmiş olmalıdır; `tool`/`auditInput` audit satırında ajanın gerçekte çağırdığı tool'u gösterir.
   */
  async proposeIntent(intent: TradeIntent, tool = "propose_trade", auditInput: unknown = intent): Promise<ToolResult> {
    if (!this.d.policy.pairs[intent.pair]) return this.reject(tool, auditInput, "INSTRUMENT_NOT_ALLOWED", intent.pair);

    const ctx = await this.buildContext(intent);
    const verdict = evaluate(ctx, this.d.policy);
    if (!verdict.allowed) return this.reject(tool, auditInput, verdict.code!, verdict.results);

    if (verdict.needsHumanApproval) {
      const summary = this.summarize(ctx, verdict);
      const approval = this.d.approvals.create(intent, summary);
      this.d.audit.append({ source: "llm", tool, input: auditInput, outcome: "PENDING_APPROVAL", code: approval.id, detail: verdict.results });
      return {
        status: "PENDING_APPROVAL",
        approval_id: approval.id,
        reasons: verdict.approvalReasons,
        message: verdict.approvalReasons.includes("UNTRUSTED_CONTENT")
          ? "Bağlamda güvenilmeyen içerik (web/haber) olduğu için işlem kullanıcı onayı bekliyor. Onay yalnızca kullanıcı arayüzünden verilebilir."
          : "İşlem kullanıcı onayı bekliyor. Onay yalnızca kullanıcı arayüzünden verilebilir.",
      };
    }
    return this.execute(ctx, verdict, "llm", undefined, tool, auditInput);
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

  /**
   * Güvenilmeyen içerik LLM bağlamına girdi: taint penceresi başlar (yeniden başlatmaya dayanıklı).
   * Web sayfası veya bayraklı haber ayrıca "sıkı" taint yazar; sonradan gelen temiz haber onu silemez.
   */
  private markUntrusted(source: "read_url" | "get_news_digest" | "user_prompt", flagged: boolean): void {
    const ts = Date.now();
    this.d.store.setKv("untrusted:last", JSON.stringify({ ts, source, flagged }));
    if (flagged) this.d.store.setKv("untrusted:strict", JSON.stringify({ ts, source }));
  }

  private untrustedState(now: number): TradeContext["untrusted"] {
    const window = this.d.policy.untrusted.taintSeconds;
    const age = (ts: number) => Math.max(0, Math.round((now - ts) / 1000));
    try {
      const strictRaw = this.d.store.getKv("untrusted:strict");
      if (strictRaw) {
        const { ts, source } = JSON.parse(strictRaw) as { ts: number; source: string };
        if (age(ts) < window) return { tainted: true, source, ageSeconds: age(ts), flagged: true };
      }
      const raw = this.d.store.getKv("untrusted:last");
      if (!raw) return { tainted: false };
      const { ts, source, flagged } = JSON.parse(raw) as { ts: number; source: string; flagged?: boolean };
      return { tainted: age(ts) < window, source, ageSeconds: age(ts), flagged };
    } catch {
      return { tainted: true, source: "unknown" }; // bozuk kayıt: fail-closed
    }
  }

  private async signalFor(intent: TradeIntent): Promise<TradeContext["signal"]> {
    const spot = this.d.policy.pairs[intent.pair]?.spot;
    if (!spot) return undefined;
    try {
      const closes = (await this.d.atk.closes(spot, "15m", 100)).map((c) => c.close);
      return { ema20: ema(closes, 20), ema50: ema(closes, 50), rsi14: rsi(closes, 14) };
    } catch {
      return undefined; // kural SIGNAL_NOT_CONFIRMED ile reddeder
    }
  }

  private async buildContext(intent: TradeIntent): Promise<TradeContext> {
    const instId = this.d.vault.resolvePair(intent.pair, intent.market);
    const chain = await this.chainState();
    const now = Date.now();
    const untrusted = this.untrustedState(now);
    const signal = untrusted.tainted && this.d.policy.untrusted.requireSignal ? await this.signalFor(intent) : undefined;
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
      untrusted,
      signal,
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
      reasons: v.approvalReasons,
    };
  }

  /** Emir parametrelerini LLM değil bu fonksiyon üretir. */
  private async execute(
    ctx: TradeContext,
    v: Verdict,
    source: "llm" | "human",
    approvalId?: string,
    tool = "propose_trade",
    auditInput: unknown = ctx.intent,
  ): Promise<ToolResult> {
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
        if (!(sz >= inst.minSz)) return this.reject(tool, auditInput, "SIZE_BELOW_MIN", { sz, minSz: inst.minSz }, source);
        params.sz = String(sz);
      } else {
        params.tdMode = "isolated";
        const contracts = round(ctx.notionalUsdt / (px * inst.ctVal), inst.lotSz);
        if (!(contracts >= inst.minSz)) return this.reject(tool, auditInput, "SIZE_BELOW_MIN", { contracts, minSz: inst.minSz }, source);
        params.sz = String(contracts);
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
      const commit = this.d.policy.intentCommit ? await this.commitIntent(intent.market, params) : undefined;
      if (commit && "rejected" in commit) return this.reject(tool, auditInput, commit.rejected, commit.detail, source);
      if (intent.market === "swap") await this.d.atk.setLeverage(instId, intent.leverage, "isolated");
      const ack = await this.d.atk.placeOrder(intent.market, params);
      // Hacim, dolum beklenmeden muhafazakâr biçimde kaydedilir.
      this.d.store.recordFill(Date.now(), instId, ctx.notionalUsdt);
      const ordToken = this.d.vault.tokenize("ORD", ack.ordId, { instId, market: intent.market });
      this.d.audit.append({
        source,
        tool: approvalId ? "approve" : tool,
        input: approvalId ? { approval_id: approvalId, ...intent } : auditInput,
        outcome: "ALLOWED",
        code: ordToken,
        detail: { rules: v.results, order: { ...params, ordId: undefined }, intentCommit: commit },
      });
      void this.snapshot(true).catch(() => undefined);
      return {
        status: "ALLOWED",
        ord_id: ordToken,
        ...(commit ? { onchain_intent: { tx: commit.txHash, finality_ms: commit.ms } } : {}),
        message: commit
          ? `Niyet Avalanche'ta ${commit.ms} ms'de kesinleşti, emir OKX'e iletildi (IOC, fiyat bantlı).`
          : "Emir OKX'e iletildi (IOC, fiyat bantlı).",
      };
    } catch (e) {
      return this.reject(tool, auditInput, e instanceof AtkError ? e.code : "ATK_ERROR", (e as Error).message, source);
    }
  }

  /**
   * Niyet hash'i = guardian'ın ürettiği emir parametreleri + policy sürümü + nonce. Avalanche'ta kesinleşmeden emir gitmez;
   * OKX emrinin clOrdId'si hash'ten türetilir, böylece borsa emri ile zincir kaydı birbirine bağlanır.
   */
  private async commitIntent(
    market: "spot" | "swap",
    params: Record<string, unknown>,
  ): Promise<{ intentHash: Hex; txHash: Hex; ms: number; preimage: string } | { rejected: string; detail: string }> {
    const preimage = JSON.stringify({ v: 1, market, ...params, policyVersion: this.d.policy.version, nonce: randomBytes(8).toString("hex") });
    const intentHash = keccak256(toBytes(preimage));
    try {
      const { txHash, ms } = await this.d.chain.commitIntent(intentHash);
      params.clOrdId = `g${intentHash.slice(2, 33)}`;
      this.d.store.recordIntent(Date.now(), intentHash, txHash, ms);
      this.emit("intent", { intentHash, txHash, ms });
      return { intentHash, txHash, ms, preimage };
    } catch (e) {
      const code = e instanceof IntentCommitError ? e.code : "INTENT_COMMIT_FAILED";
      return { rejected: code, detail: (e as Error).message };
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
