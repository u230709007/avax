// docs: docs/avalanche.md
/**
 * Kill-switch gecikmesini Fuji'de canlı ölçer: pause() → kesinleşme → IntentGate.commit'in reddedildiği an → unpause().
 * Sonuç data/killswitch-latency.json'a yazılır (herkese açık panel gösterir). Hata olsa da sonunda unpause denenir.
 * Gerekli: DEPLOYER_PRIVATE_KEY (sahip), POLICY_REGISTRY_ADDRESS; isteğe bağlı INTENT_GATE_ADDRESS + ANCHOR_PRIVATE_KEY.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { BaseError, ContractFunctionRevertedError, createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { INTENT_GATE_ABI, POLICY_REGISTRY_ABI } from "../src/chain/abi.js";
import { loadPolicy } from "../src/config/policy.js";

const pk = (v: string): Hex => (v.startsWith("0x") ? v : `0x${v}`) as Hex;
const registry = process.env.POLICY_REGISTRY_ADDRESS as Address | undefined;
const gate = process.env.INTENT_GATE_ADDRESS as Address | undefined;
if (!process.env.DEPLOYER_PRIVATE_KEY || !registry) throw new Error("DEPLOYER_PRIVATE_KEY ve POLICY_REGISTRY_ADDRESS gerekli");

const rpc = process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
const owner = privateKeyToAccount(pk(process.env.DEPLOYER_PRIVATE_KEY));
const committer = process.env.ANCHOR_PRIVATE_KEY ? privateKeyToAccount(pk(process.env.ANCHOR_PRIVATE_KEY)) : undefined;
const pub = createPublicClient({ chain: avalancheFuji, transport: http(rpc) });
const wallet = createWalletClient({ account: owner, chain: avalancheFuji, transport: http(rpc) });
const { hash: policyHash } = loadPolicy();

const [, , pausedBefore] = await pub.readContract({ address: registry, abi: POLICY_REGISTRY_ABI, functionName: "state" });
if (pausedBefore) throw new Error("Kontrat zaten durdurulmuş; önce arayüzden veya unpause() ile açın");

/** IntentGate şu an commit'i reddediyor mu? (gas harcamadan simülasyon) */
async function gateBlocks(): Promise<boolean> {
  if (!gate || !committer) return false;
  try {
    await pub.simulateContract({ address: gate, abi: INTENT_GATE_ABI, functionName: "commit", args: [`0x${"ab".repeat(32)}`, policyHash], account: committer });
    return false;
  } catch (e) {
    const err = e instanceof BaseError ? (e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null) : null;
    return err?.data?.errorName === "PausedOnchain";
  }
}

const result: Record<string, unknown> = { ts: Date.now(), network: "Avalanche Fuji C-Chain (43113)", registry, intentGate: gate ?? null };
let paused = false;
try {
  const t0 = performance.now();
  const pauseTx = await wallet.writeContract({ address: registry, abi: POLICY_REGISTRY_ABI, functionName: "pause" });
  paused = true; // gönderildi: makbuz beklerken hata olsa da sonunda unpause denenir
  const r = await pub.waitForTransactionReceipt({ hash: pauseTx, pollingInterval: 100 });
  if (r.status !== "success") throw new Error(`pause tx başarısız: ${pauseTx}`);
  result.pauseTx = pauseTx;
  result.pauseFinalityMs = Math.round(performance.now() - t0);
  if (gate && committer) {
    while (!(await gateBlocks())) {
      if (performance.now() - t0 > 30_000) throw new Error("IntentGate 30 sn içinde durdurmayı görmedi");
    }
    result.gateBlockedAfterMs = Math.round(performance.now() - t0);
  }
} finally {
  if (paused) {
    const t1 = performance.now();
    const unpauseTx = await wallet.writeContract({ address: registry, abi: POLICY_REGISTRY_ABI, functionName: "unpause" });
    await pub.waitForTransactionReceipt({ hash: unpauseTx, pollingInterval: 100 });
    result.unpauseTx = unpauseTx;
    result.unpauseFinalityMs = Math.round(performance.now() - t1);
  }
}

mkdirSync("data", { recursive: true });
writeFileSync("data/killswitch-latency.json", JSON.stringify(result, null, 2));
console.log(`pause() kesinleşme: ${result.pauseFinalityMs} ms  (tx ${result.pauseTx})`);
if (result.gateBlockedAfterMs !== undefined) console.log(`IntentGate yeni emri reddetti: pause gönderiminden ${result.gateBlockedAfterMs} ms sonra`);
console.log(`unpause() kesinleşme: ${result.unpauseFinalityMs} ms\nYazıldı: data/killswitch-latency.json`);
