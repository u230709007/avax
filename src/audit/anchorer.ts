// docs: docs/audit.md
import type { Store } from "../store/db.js";
import type { AvalancheGuard } from "../chain/avalanche.js";
import { AuditLog } from "./log.js";

export interface AnchorRow {
  id: number;
  ts: number;
  fromSeq: number;
  toSeq: number;
  root: string;
  txHash: string | null;
}

/**
 * Audit log'un Merkle kökünü periyodik olarak Avalanche AuditAnchor'a yazar.
 * Kontratın nextSeq değeri tek gerçek kaynaktır; aralıklar boşluksuz gider.
 */
export class Anchorer {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private lastAnchorAt = Date.now();
  lastError: string | undefined;
  /** Kişisel hesaplarda kapalı: AuditAnchor tek ve ardışık bir seq akışı kabul eder (docs/tenants.md). */
  disabled = false;

  constructor(
    private readonly store: Store,
    private readonly audit: AuditLog,
    private readonly chain: AvalancheGuard,
    private readonly everyDecisions: number,
    private readonly everySeconds: number,
    public onAnchored: (a: AnchorRow) => void = () => undefined,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), 15_000);
    this.audit.onAppend(() => void this.tick());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  list(): AnchorRow[] {
    const rows = this.store.db.prepare("SELECT * FROM anchors ORDER BY id DESC").all() as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as number,
      ts: r.ts as number,
      fromSeq: r.from_seq as number,
      toSeq: r.to_seq as number,
      root: r.root as string,
      txHash: (r.tx_hash as string | null) ?? null,
    }));
  }

  /** Bir seq'i kapsayan anchor (yerel kayıt). */
  forSeq(seq: number): AnchorRow | undefined {
    return this.list().find((a) => a.fromSeq <= seq && seq <= a.toSeq && a.txHash);
  }

  /** Kaydın Merkle kanıtını zincirdeki kökle karşılaştırır (özel ve herkese açık API ortak kullanır). */
  async verify(seq: number): Promise<{ error: "not_anchored_yet" | "anchor_not_found_onchain" } | {
    seq: number;
    onchainRoot: string;
    localRoot: string;
    verified: boolean;
    chainIntact: boolean;
    txHash: string | null;
  }> {
    const anchor = this.forSeq(seq);
    if (!anchor) return { error: "not_anchored_yet" };
    const local = this.audit.proofFor(seq, anchor.fromSeq, anchor.toSeq);
    const count = await this.chain.anchorCount();
    for (let i = count - 1; i >= 0; i--) {
      const onchain = await this.chain.readAnchor(i);
      if (onchain.fromSeq <= seq && seq <= onchain.toSeq) {
        return {
          seq,
          onchainRoot: onchain.root,
          localRoot: local.root,
          verified: AuditLog.verify(local.leaf, local.proof, onchain.root),
          chainIntact: this.audit.verifyChain().ok,
          txHash: anchor.txHash,
        };
      }
    }
    return { error: "anchor_not_found_onchain" };
  }

  async tick(force = false): Promise<void> {
    if (this.disabled || this.running || !this.chain.auditAnchor) return;
    this.running = true;
    try {
      const lastSeq = this.audit.lastSeq();
      const nextSeq = await this.chain.anchorNextSeq();
      const pending = lastSeq - nextSeq + 1;
      if (pending <= 0) return;
      const due = force || pending >= this.everyDecisions || Date.now() - this.lastAnchorAt >= this.everySeconds * 1000;
      if (!due) return;
      const toSeq = Math.min(lastSeq, nextSeq + 255);
      const root = this.audit.rootFor(nextSeq, toSeq);
      const txHash = await this.chain.anchor(root, nextSeq, toSeq);
      const res = this.store.db
        .prepare("INSERT INTO anchors (ts, from_seq, to_seq, root, tx_hash) VALUES (?, ?, ?, ?, ?)")
        .run(Date.now(), nextSeq, toSeq, root, txHash);
      this.lastAnchorAt = Date.now();
      this.lastError = undefined;
      this.onAnchored({ id: Number(res.lastInsertRowid), ts: Date.now(), fromSeq: nextSeq, toSeq, root, txHash });
    } catch (e) {
      this.lastError = (e as Error).message.slice(0, 200);
    } finally {
      this.running = false;
    }
  }
}
