// docs: docs/ARCHITECTURE.md
import "./env.js";
import type { Address, Hex } from "viem";
import { loadPolicy } from "./config/policy.js";
import { Store } from "./store/db.js";
import { Vault } from "./masking/vault.js";
import { AuditLog } from "./audit/log.js";
import { AvalancheGuard } from "./chain/avalanche.js";
import { Approvals } from "./approval/human.js";
import { AtkClient } from "./upstream/atkClient.js";
import { AtkTools } from "./upstream/atkTools.js";
import { Guardian } from "./guardian.js";
import { quarantineDigest } from "./llm/quarantine.js";
import { Anchorer } from "./audit/anchorer.js";

export interface App {
  guardian: Guardian;
  store: Store;
  vault: Vault;
  audit: AuditLog;
  chain: AvalancheGuard;
  approvals: Approvals;
  atk: AtkClient;
  anchorer: Anchorer;
  policyHash: Hex;
  atkError?: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} tanımlı değil (.env.example'a bakın)`);
  return v;
}

const optAddress = (v: string | undefined) => (v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined);

/** Açılış (workflow 0. adım). Eksik/erişilemeyen bileşen fail-closed olarak işaretlenir. */
export async function bootstrap(): Promise<App> {
  const { policy, hash } = loadPolicy();
  const store = new Store(process.env.DB_PATH ?? "data/guardian.db");
  const vault = new Vault(required("VAULT_HMAC_KEY"), store, policy);
  const audit = new AuditLog(store);
  const integrity = audit.verifyChain();
  if (!integrity.ok) throw new Error(`Audit zinciri bozuk (seq ${integrity.seq}); veritabanı değiştirilmiş olabilir`);

  const pk = process.env.ANCHOR_PRIVATE_KEY;
  const chain = new AvalancheGuard({
    rpcUrl: process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc",
    policyRegistry: optAddress(process.env.POLICY_REGISTRY_ADDRESS),
    auditAnchor: optAddress(process.env.AUDIT_ANCHOR_ADDRESS),
    anchorPrivateKey: pk ? ((pk.startsWith("0x") ? pk : `0x${pk}`) as Hex) : undefined,
    localPolicyHash: hash,
    cacheSeconds: policy.chainCacheSeconds,
  });
  await chain.state(true);

  const approvals = new Approvals(store, policy.approvalTtlSeconds);
  const atk = new AtkClient({ profile: process.env.OKX_PROFILE ?? "demo", site: process.env.OKX_SITE ?? "global" });
  let atkError: string | undefined;
  try {
    await atk.connect();
  } catch (e) {
    atkError = (e as Error).message;
  }

  const guardian = new Guardian({
    policy,
    store,
    vault,
    audit,
    chain,
    approvals,
    atk: new AtkTools(atk),
    quarantine: quarantineDigest,
    readUrlAllowlist: (process.env.READ_URL_ALLOWLIST ?? "localhost,127.0.0.1").split(",").map((s) => s.trim()).filter(Boolean),
  });

  const anchorer = new Anchorer(store, audit, chain, policy.anchorEveryDecisions, policy.anchorEverySeconds);
  audit.append({
    source: "system",
    tool: "startup",
    input: {},
    outcome: "OK",
    detail: { policyVersion: policy.version, policyHash: hash, atk: atkError ? "unavailable" : "connected" },
  });
  return { guardian, store, vault, audit, chain, approvals, atk, anchorer, policyHash: hash, atkError };
}
