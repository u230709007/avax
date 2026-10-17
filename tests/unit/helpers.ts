import { parsePolicy } from "../../src/config/policy.js";
import { readFileSync } from "node:fs";
import { Store } from "../../src/store/db.js";
import { Vault } from "../../src/masking/vault.js";
import { AuditLog } from "../../src/audit/log.js";
import { Approvals } from "../../src/approval/human.js";
import { Guardian, type QuarantineFn } from "../../src/guardian.js";
import type { AtkTools } from "../../src/upstream/atkTools.js";
import type { AvalancheGuard, ChainSnapshot } from "../../src/chain/avalanche.js";
import { AVAX_PRICE, BALANCE, INSTRUMENT } from "../fixtures/okx.js";

export const POLICY_RAW = readFileSync("policy.json", "utf8");
export const { policy, hash: policyHash } = parsePolicy(POLICY_RAW);
export const HMAC = "test-hmac-key-0123456789abcdef0123456789";

export function makeVault() {
  const store = new Store(":memory:");
  return { store, vault: new Vault(HMAC, store, policy) };
}

/** Test çifti: ATK yerine fixture döner, yapılan emirleri kaydeder. */
export function makeGuardian(
  opts: { chain?: Partial<ChainSnapshot>; dayStartEq?: number; quarantine?: QuarantineFn; fetchImpl?: typeof fetch; closes?: number[]; commitError?: Error; news?: { title?: string; summary?: string }[] } = {},
) {
  const { store, vault } = makeVault();
  const audit = new AuditLog(store);
  const approvals = new Approvals(store, policy.approvalTtlSeconds);
  const placed: { market: string; params: Record<string, unknown> }[] = [];
  const atk = {
    balance: async () => BALANCE,
    positions: async () => [],
    news: async () => opts.news ?? [],
    lastPrice: async () => AVAX_PRICE,
    instrument: async () => INSTRUMENT,
    closes: async () => (opts.closes ?? []).map((close, i) => ({ ts: i, close })),
    setLeverage: async () => undefined,
    closePosition: async () => undefined,
    cancelOrder: async () => undefined,
    placeOrder: async (market: string, params: Record<string, unknown>) => {
      placed.push({ market, params });
      return { ordId: "612345678901234567", clOrdId: "", sCode: "0", sMsg: "" };
    },
  } as unknown as AtkTools;
  const chainState: ChainSnapshot = {
    reachable: true,
    policyHashMatches: true,
    paused: false,
    localHash: policyHash,
    checkedAt: Date.now(),
    ...opts.chain,
  };
  const commits: `0x${string}`[] = [];
  const chain = {
    state: async () => chainState,
    commitIntent: async (h: `0x${string}`) => {
      if (opts.commitError) throw opts.commitError;
      commits.push(h);
      return { txHash: `0x${"cd".repeat(32)}`, ms: 1200 };
    },
  } as unknown as AvalancheGuard;
  if (opts.dayStartEq) store.setKv(`dayStartEq:${new Date().toISOString().slice(0, 10)}`, String(opts.dayStartEq));
  const guardian = new Guardian({
    policy,
    store,
    vault,
    audit,
    chain,
    approvals,
    atk,
    quarantine: opts.quarantine ?? (async (_t, flags) => [{ coin: "AVAX", sentiment: "neutral", score: 0.5, flags }]),
    readUrlAllowlist: ["localhost"],
    fetchImpl: opts.fetchImpl,
  });
  return { guardian, store, vault, audit, approvals, placed, commits, atk };
}
