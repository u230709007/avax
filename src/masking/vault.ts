// docs: docs/masking.md
import { createHmac } from "node:crypto";
import type { Policy } from "../config/policy.js";
import type { Store } from "../store/db.js";

export type TokenKind = "ORD" | "POS" | "ALGO" | "APR";
export type Bucket = "DÜŞÜK" | "ORTA" | "YÜKSEK";

const TOKEN_RE = /\b(ORD|POS|ALGO|APR)_[0-9a-f]{8}\b/g;
const PAIR_TOKEN_RE = /\bP_[A-Z0-9]+\b/g;
const DISPLAY_TAG_RE = /\{\{\s*[A-Z]+(?::[A-Z0-9_-]+)?\s*\}\}/;
const EVM_ADDRESS_RE = /0x[a-fA-F0-9]{40}/;
const BASE58_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const LONG_NUMERIC_ID_RE = /\b\d{9,}\b/;

export interface LeakFinding {
  path: string;
  reason: "EVM_ADDRESS" | "BASE58_ADDRESS" | "RAW_NUMERIC_ID" | "DISPLAY_TAG" | "UNKNOWN_TOKEN" | "UNKNOWN_PAIR";
}

/**
 * Masking Vault: gerçek değerleri sunucuda tutar, LLM'e sadece opak tanıtıcı ve kova verir.
 * Tanıtıcılar HMAC(VAULT_HMAC_KEY, kind:real) ile deterministiktir; eşleme SQLite'ta kalıcıdır.
 */
export class Vault {
  private readonly displayValues = new Map<string, string>();

  constructor(
    private readonly hmacKey: string,
    private readonly store: Store,
    private readonly policy: Policy,
  ) {
    if (hmacKey.length < 32) throw new Error("VAULT_HMAC_KEY en az 32 karakter olmalı");
  }

  tokenize(kind: TokenKind, real: string, meta?: Record<string, unknown>): string {
    const digest = createHmac("sha256", this.hmacKey).update(`${kind}:${real}`).digest("hex");
    const token = `${kind}_${digest.slice(0, 8)}`;
    this.store.db
      .prepare(
        "INSERT INTO vault (token, kind, real, meta) VALUES (?, ?, ?, ?) ON CONFLICT(token) DO UPDATE SET meta = excluded.meta",
      )
      .run(token, kind, real, meta ? JSON.stringify(meta) : null);
    return token;
  }

  resolve(token: string, kind: TokenKind): { real: string; meta?: Record<string, unknown> } | undefined {
    const row = this.store.db.prepare("SELECT real, meta FROM vault WHERE token = ? AND kind = ?").get(token, kind) as
      | { real: string; meta: string | null }
      | undefined;
    if (!row) return undefined;
    return { real: row.real, meta: row.meta ? (JSON.parse(row.meta) as Record<string, unknown>) : undefined };
  }

  pairTokens(): string[] {
    return Object.keys(this.policy.pairs);
  }

  resolvePair(token: string, market: "spot" | "swap"): string | undefined {
    return this.policy.pairs[token]?.[market];
  }

  pairTokenForInstId(instId: string): string | undefined {
    for (const [token, p] of Object.entries(this.policy.pairs)) {
      if (p.spot === instId || p.swap === instId) return token;
    }
    return undefined;
  }

  bucket(usdt: number): Bucket {
    const [low, high] = this.policy.balanceBucketsUsdt;
    if (usdt < low) return "DÜŞÜK";
    if (usdt <= high) return "ORTA";
    return "YÜKSEK";
  }

  /** Ekranda maske açma için gösterim etiketi kaydeder; gerçek değer LLM'e gitmez. */
  setDisplay(tag: string, value: string): string {
    const normalized = `{{${tag}}}`;
    this.displayValues.set(normalized, value);
    return normalized;
  }

  displayValue(tag: string): string | undefined {
    return this.displayValues.get(tag);
  }

  /** LLM'den gelen her değeri tarar: ham adres, uzun sayısal ID, gösterim etiketi veya bilinmeyen tanıtıcı. */
  scanForLeaks(value: unknown, path = "$"): LeakFinding[] {
    const findings: LeakFinding[] = [];
    if (typeof value === "string") {
      if (EVM_ADDRESS_RE.test(value)) findings.push({ path, reason: "EVM_ADDRESS" });
      else if (BASE58_RE.test(value) && /\d/.test(value) && /[a-z]/.test(value) && /[A-Z]/.test(value))
        findings.push({ path, reason: "BASE58_ADDRESS" });
      if (LONG_NUMERIC_ID_RE.test(value)) findings.push({ path, reason: "RAW_NUMERIC_ID" });
      if (DISPLAY_TAG_RE.test(value)) findings.push({ path, reason: "DISPLAY_TAG" });
      for (const m of value.matchAll(TOKEN_RE)) {
        const kind = m[1] as TokenKind;
        if (!this.resolve(m[0], kind)) findings.push({ path, reason: "UNKNOWN_TOKEN" });
      }
      for (const m of value.matchAll(PAIR_TOKEN_RE)) {
        if (!this.policy.pairs[m[0]]) findings.push({ path, reason: "UNKNOWN_PAIR" });
      }
    } else if (typeof value === "number") {
      if (Number.isInteger(value) && Math.abs(value) >= 1e9) findings.push({ path, reason: "RAW_NUMERIC_ID" });
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => findings.push(...this.scanForLeaks(v, `${path}[${i}]`)));
    } else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) findings.push(...this.scanForLeaks(v, `${path}.${k}`));
    }
    return findings;
  }
}
