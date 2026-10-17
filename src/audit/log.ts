// docs: docs/audit.md
import { keccak256, toBytes, type Hex } from "viem";
import type { Store } from "../store/db.js";
import { merkleProof, merkleRoot, verifyProof, type ProofStep } from "./merkle.js";

export type Outcome = "ALLOWED" | "REJECTED" | "PENDING_APPROVAL" | "WARNING" | "OK" | "ERROR";

export interface AuditInput {
  source: "llm" | "human" | "system";
  tool: string;
  /** Sadece maskeli girdi yazılır. */
  input: unknown;
  outcome: Outcome;
  code?: string;
  detail?: unknown;
}

export interface AuditRow {
  seq: number;
  ts: number;
  source: string;
  tool: string;
  input: unknown;
  outcome: Outcome;
  code: string | null;
  detail: unknown;
  prevHash: Hex;
  hash: Hex;
}

const GENESIS: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";

/** Kanonik JSON: anahtarlar sıralı, böylece hash deterministik. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const entries = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`).join(",")}}`;
}

export function entryHash(prevHash: Hex, seq: number, ts: number, e: AuditInput): Hex {
  const body = canonical({ seq, ts, source: e.source, tool: e.tool, input: e.input, outcome: e.outcome, code: e.code ?? null, detail: e.detail ?? null });
  return keccak256(toBytes(`${prevHash}|${body}`));
}

type Listener = (row: AuditRow) => void;

/** Hash zincirli, sadece eklemeli audit log. */
export class AuditLog {
  private listeners: Listener[] = [];

  constructor(private readonly store: Store) {}

  onAppend(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  append(e: AuditInput): AuditRow {
    const last = this.store.db.prepare("SELECT seq, hash FROM audit ORDER BY seq DESC LIMIT 1").get() as
      | { seq: number; hash: Hex }
      | undefined;
    const seq = (last?.seq ?? 0) + 1;
    const prevHash = last?.hash ?? GENESIS;
    const ts = Date.now();
    const hash = entryHash(prevHash, seq, ts, e);
    this.store.db
      .prepare(
        "INSERT INTO audit (seq, ts, source, tool, input, outcome, code, detail, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(seq, ts, e.source, e.tool, canonical(e.input), e.outcome, e.code ?? null, canonical(e.detail ?? null), prevHash, hash);
    const row: AuditRow = { seq, ts, source: e.source, tool: e.tool, input: e.input, outcome: e.outcome, code: e.code ?? null, detail: e.detail ?? null, prevHash, hash };
    for (const l of this.listeners) l(row);
    return row;
  }

  recent(limit = 100, offset = 0): AuditRow[] {
    const rows = this.store.db
      .prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as Record<string, unknown>[];
    return rows.map(toRow);
  }

  get(seq: number): AuditRow | undefined {
    const r = this.store.db.prepare("SELECT * FROM audit WHERE seq = ?").get(seq) as Record<string, unknown> | undefined;
    return r ? toRow(r) : undefined;
  }

  lastSeq(): number {
    const r = this.store.db.prepare("SELECT MAX(seq) AS m FROM audit").get() as { m: number | null };
    return r.m ?? 0;
  }

  hashesInRange(fromSeq: number, toSeq: number): Hex[] {
    const rows = this.store.db.prepare("SELECT hash FROM audit WHERE seq BETWEEN ? AND ? ORDER BY seq").all(fromSeq, toSeq) as { hash: Hex }[];
    return rows.map((r) => r.hash);
  }

  /** Tüm zinciri baştan doğrular; ilk bozuk seq'i döner. */
  verifyChain(): { ok: true } | { ok: false; seq: number } {
    let prev = GENESIS;
    const rows = this.store.db.prepare("SELECT * FROM audit ORDER BY seq").all() as Record<string, unknown>[];
    for (const r of rows) {
      const row = toRow(r);
      const expected = entryHash(prev, row.seq, row.ts, { source: row.source as AuditInput["source"], tool: row.tool, input: row.input, outcome: row.outcome, code: row.code ?? undefined, detail: row.detail });
      if (row.prevHash !== prev || row.hash !== expected) return { ok: false, seq: row.seq };
      prev = row.hash;
    }
    return { ok: true };
  }

  rootFor(fromSeq: number, toSeq: number): Hex {
    return merkleRoot(this.hashesInRange(fromSeq, toSeq));
  }

  proofFor(seq: number, fromSeq: number, toSeq: number): { leaf: Hex; proof: ProofStep[]; root: Hex } {
    const leaves = this.hashesInRange(fromSeq, toSeq);
    const idx = seq - fromSeq;
    const leaf = leaves[idx];
    if (!leaf) throw new Error(`seq ${seq} aralıkta değil`);
    return { leaf, proof: merkleProof(leaves, idx), root: merkleRoot(leaves) };
  }

  static verify(leaf: Hex, proof: ProofStep[], root: Hex): boolean {
    return verifyProof(leaf, proof, root);
  }
}

function toRow(r: Record<string, unknown>): AuditRow {
  return {
    seq: r.seq as number,
    ts: r.ts as number,
    source: r.source as string,
    tool: r.tool as string,
    input: JSON.parse(r.input as string),
    outcome: r.outcome as Outcome,
    code: (r.code as string | null) ?? null,
    detail: JSON.parse(r.detail as string),
    prevHash: r.prev_hash as Hex,
    hash: r.hash as Hex,
  };
}
