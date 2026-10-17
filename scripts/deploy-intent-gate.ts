// docs: docs/avalanche.md
/**
 * IntentGate'i Fuji'ye kurar: mevcut PolicyRegistry'ye bağlı, committer = ANCHOR cüzdanı (guardian'ın gas cüzdanı).
 * Gerekli: DEPLOYER_PRIVATE_KEY, ANCHOR_PRIVATE_KEY, POLICY_REGISTRY_ADDRESS. Önce `npm run contracts:build`.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

const pk = (name: string): Hex => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} gerekli`);
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
};
const registry = process.env.POLICY_REGISTRY_ADDRESS as Address | undefined;
if (!registry) throw new Error("POLICY_REGISTRY_ADDRESS gerekli");

const rpc = process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
const owner = privateKeyToAccount(pk("DEPLOYER_PRIVATE_KEY"));
const committer = privateKeyToAccount(pk("ANCHOR_PRIVATE_KEY"));
const pub = createPublicClient({ chain: avalancheFuji, transport: http(rpc) });
const wallet = createWalletClient({ account: owner, chain: avalancheFuji, transport: http(rpc) });

const a = JSON.parse(readFileSync("contracts/artifacts/IntentGate.json", "utf8")) as { abi: never; bytecode: Hex };
const tx = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args: [registry, committer.address] as never });
const r = await pub.waitForTransactionReceipt({ hash: tx });
if (!r.contractAddress) throw new Error("IntentGate deploy başarısız");
console.log(`IntentGate: ${r.contractAddress}  (tx ${tx})`);
console.log(`\n.env dosyasına ekleyin:\nINTENT_GATE_ADDRESS=${r.contractAddress}`);
console.log(`Committer (anchor cüzdanı): ${committer.address}`);
