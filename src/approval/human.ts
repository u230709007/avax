// docs: docs/WORKFLOW.md
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import type { Store } from "../store/db.js";
import type { TradeIntent } from "../policy/intent.js";

export interface ApprovalSummary {
  instId: string;
  market: "spot" | "swap";
  side: "buy" | "sell";
  notionalUsdt: number;
  leverage: number;
  slPct?: number;
  tpPct?: number;
  rules: { rule: string; ok: boolean; detail?: string }[];
}

export interface Approval {
  id: string;
  created: number;
  expires: number;
  status: "pending" | "approved" | "rejected" | "expired" | "executed" | "failed";
  intent: TradeIntent;
  summary: ApprovalSummary;
}

/**
 * İnsan onayı. Onay SADECE yerel token'lı HTTP uç noktasından gelir;
 * LLM'in onaylayacak bir tool'u yoktur.
 */
export class Approvals extends EventEmitter {
  constructor(
    private readonly store: Store,
    private readonly ttlSeconds: number,
  ) {
    super();
  }

  create(intent: TradeIntent, summary: ApprovalSummary): Approval {
    const now = Date.now();
    const a: Approval = {
      id: `APR_${randomBytes(4).toString("hex")}`,
      created: now,
      expires: now + this.ttlSeconds * 1000,
      status: "pending",
      intent,
      summary,
    };
    this.store.db
      .prepare("INSERT INTO approvals (id, created, expires, status, intent, summary) VALUES (?, ?, ?, ?, ?, ?)")
      .run(a.id, a.created, a.expires, a.status, JSON.stringify(intent), JSON.stringify(summary));
    this.emit("created", a);
    return a;
  }

  get(id: string): Approval | undefined {
    const r = this.store.db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!r) return undefined;
    const a: Approval = {
      id: r.id as string,
      created: r.created as number,
      expires: r.expires as number,
      status: r.status as Approval["status"],
      intent: JSON.parse(r.intent as string),
      summary: JSON.parse(r.summary as string),
    };
    if (a.status === "pending" && Date.now() > a.expires) {
      this.setStatus(a.id, "expired");
      a.status = "expired";
    }
    return a;
  }

  pending(): Approval[] {
    const rows = this.store.db.prepare("SELECT id FROM approvals WHERE status = 'pending' ORDER BY created DESC").all() as { id: string }[];
    return rows.map((r) => this.get(r.id)).filter((a): a is Approval => a?.status === "pending");
  }

  setStatus(id: string, status: Approval["status"]): void {
    this.store.db.prepare("UPDATE approvals SET status = ? WHERE id = ?").run(status, id);
    this.emit("updated", { id, status });
  }
}
