// docs: docs/audit.md
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Kalıcı durum: audit log, 24s hacim/rate-limit sayaçları, onaylar, anchor'lar, vault eşlemeleri.
 * Restart'ta sıfırlanmaz; böylece limit bölme saldırısı restart ile aşılamaz.
 */
export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS audit (
        seq INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        source TEXT NOT NULL,
        tool TEXT NOT NULL,
        input TEXT NOT NULL,
        outcome TEXT NOT NULL,
        code TEXT,
        detail TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fills (
        id INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        pair TEXT NOT NULL,
        usdt REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY,
        created INTEGER NOT NULL,
        expires INTEGER NOT NULL,
        status TEXT NOT NULL,
        intent TEXT NOT NULL,
        summary TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS anchors (
        id INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        from_seq INTEGER NOT NULL,
        to_seq INTEGER NOT NULL,
        root TEXT NOT NULL,
        tx_hash TEXT
      );
      CREATE TABLE IF NOT EXISTS vault (
        token TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        real TEXT NOT NULL,
        meta TEXT
      );
      CREATE TABLE IF NOT EXISTS kv (
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        plan TEXT NOT NULL,
        key_hash TEXT NOT NULL UNIQUE,
        created INTEGER NOT NULL,
        revoked INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        key_id TEXT NOT NULL,
        tool TEXT NOT NULL,
        status TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS usage_key_ts ON usage (key_id, ts);
      CREATE TABLE IF NOT EXISTS intents (
        id INTEGER PRIMARY KEY,
        ts INTEGER NOT NULL,
        intent_hash TEXT NOT NULL,
        tx_hash TEXT NOT NULL,
        commit_ms INTEGER NOT NULL
      );
    `);
  }

  getKv(k: string): string | undefined {
    const row = this.db.prepare("SELECT v FROM kv WHERE k = ?").get(k) as { v: string } | undefined;
    return row?.v;
  }

  setKv(k: string, v: string): void {
    this.db.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v);
  }

  recordFill(ts: number, pair: string, usdt: number): void {
    this.db.prepare("INSERT INTO fills (ts, pair, usdt) VALUES (?, ?, ?)").run(ts, pair, usdt);
  }

  volumeSince(ts: number): number {
    const row = this.db.prepare("SELECT COALESCE(SUM(usdt), 0) AS s FROM fills WHERE ts >= ?").get(ts) as { s: number };
    return row.s;
  }

  ordersSince(ts: number): number {
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM fills WHERE ts >= ?").get(ts) as { c: number };
    return row.c;
  }

  recordIntent(ts: number, intentHash: string, txHash: string, commitMs: number): void {
    this.db.prepare("INSERT INTO intents (ts, intent_hash, tx_hash, commit_ms) VALUES (?, ?, ?, ?)").run(ts, intentHash, txHash, commitMs);
  }

  recentIntents(limit = 20): { ts: number; intentHash: string; txHash: string; commitMs: number }[] {
    return this.db
      .prepare("SELECT ts, intent_hash AS intentHash, tx_hash AS txHash, commit_ms AS commitMs FROM intents ORDER BY id DESC LIMIT ?")
      .all(limit) as { ts: number; intentHash: string; txHash: string; commitMs: number }[];
  }
}
