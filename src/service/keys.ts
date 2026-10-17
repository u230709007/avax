// docs: docs/service.md
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Store } from "../store/db.js";

/**
 * Servis planları: guardian'ı uzak MCP servisi olarak kullanan her ajan bir anahtar + plan alır.
 * Kota kodda uygulanır; fiyat sadece bilgi amaçlıdır (faturalama dışarıda).
 */
export const PLANS = Object.freeze({
  sandbox: { label: "Sandbox", priceUsdMonth: 0, callsPerDay: 200, tradesPerDay: 5, perTradeUsd: 0 },
  pro: { label: "Pro", priceUsdMonth: 29, callsPerDay: 5_000, tradesPerDay: 100, perTradeUsd: 0 },
  desk: { label: "Desk", priceUsdMonth: 0, callsPerDay: 50_000, tradesPerDay: 2_000, perTradeUsd: 0.05 },
} as const);

export type PlanId = keyof typeof PLANS;
export const isPlan = (p: string): p is PlanId => Object.hasOwn(PLANS, p);

/** Kotaya sayılan "korunan işlem": guardian'ın kurallardan geçirip emre çevirdiği veya onaya aldığı öneri. */
const TRADE_STATUSES = ["ALLOWED", "PENDING_APPROVAL"];
/** "Korunan işlem" sayılan tool'lar: guardian'ın 7 tool'undan propose_trade + ATK uyumlu kapının emir tool'ları (docs/compat.md). */
export const TRADE_TOOLS = ["propose_trade", "spot_place_order", "swap_place_order"];
const DAY_MS = 86_400_000;

export interface ApiKey {
  id: string;
  name: string;
  plan: PlanId;
  created: number;
  revoked: boolean;
}

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Anahtar sadece oluşturulurken bir kez gösterilir; veritabanında sha256'sı tutulur. */
export class ApiKeys {
  constructor(private readonly store: Store) {}

  create(name: string, plan: PlanId): { key: string; id: string } {
    const id = `ak_${randomBytes(4).toString("hex")}`;
    const key = `sig_${randomBytes(24).toString("base64url")}`;
    this.store.db
      .prepare("INSERT INTO api_keys (id, name, plan, key_hash, created) VALUES (?, ?, ?, ?, ?)")
      .run(id, name.slice(0, 80), plan, hashKey(key), Date.now());
    return { key, id };
  }

  /** Bearer anahtarını çözer; iptal edilmiş veya bilinmeyen anahtar undefined döner. */
  authenticate(key: string | undefined): ApiKey | undefined {
    if (!key || !key.startsWith("sig_")) return undefined;
    const h = hashKey(key);
    const row = this.store.db.prepare("SELECT id, name, plan, key_hash, created, revoked FROM api_keys WHERE key_hash = ?").get(h) as
      | { id: string; name: string; plan: string; key_hash: string; created: number; revoked: number }
      | undefined;
    if (!row || row.revoked || !isPlan(row.plan)) return undefined;
    if (!timingSafeEqual(Buffer.from(row.key_hash), Buffer.from(h))) return undefined;
    return { id: row.id, name: row.name, plan: row.plan, created: row.created, revoked: false };
  }

  list(): ApiKey[] {
    const rows = this.store.db.prepare("SELECT id, name, plan, created, revoked FROM api_keys ORDER BY created").all() as {
      id: string;
      name: string;
      plan: PlanId;
      created: number;
      revoked: number;
    }[];
    return rows.map((r) => ({ ...r, revoked: Boolean(r.revoked) }));
  }

  revoke(id: string): boolean {
    return this.store.db.prepare("UPDATE api_keys SET revoked = 1 WHERE id = ?").run(id).changes > 0;
  }

  record(keyId: string, tool: string, status: string, ts = Date.now()): void {
    this.store.db.prepare("INSERT INTO usage (ts, key_id, tool, status) VALUES (?, ?, ?, ?)").run(ts, keyId, tool, status);
  }

  usage(keyId: string, since = Date.now() - DAY_MS): { calls: number; trades: number } {
    const row = this.store.db
      .prepare(
        `SELECT COUNT(*) AS calls,
                COALESCE(SUM(CASE WHEN tool IN (${TRADE_TOOLS.map(() => "?").join(",")}) AND status IN (${TRADE_STATUSES.map(() => "?").join(",")}) THEN 1 ELSE 0 END), 0) AS trades
         FROM usage WHERE key_id = ? AND ts >= ?`,
      )
      .get(...TRADE_TOOLS, ...TRADE_STATUSES, keyId, since) as { calls: number; trades: number };
    return { calls: row.calls, trades: row.trades };
  }

  /** Çağrı öncesi kota: aşılırsa ret kodu döner. emir tool'ları (TRADE_TOOLS) ayrıca işlem kotasına tabidir. */
  quotaError(key: ApiKey, tool: string): string | undefined {
    const plan = PLANS[key.plan];
    const u = this.usage(key.id);
    if (u.calls >= plan.callsPerDay) return "QUOTA_CALLS_EXCEEDED";
    if (TRADE_TOOLS.includes(tool) && u.trades >= plan.tradesPerDay) return "QUOTA_TRADES_EXCEEDED";
    return undefined;
  }
}
