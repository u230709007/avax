// docs: docs/avalanche.md
/**
 * PolicyRegistry (sahip = DEPLOYER) ve AuditAnchor (anchorer = ANCHOR cüzdanı) kontratlarını Fuji'ye kurar.
 * Gerekli: DEPLOYER_PRIVATE_KEY (sahip cüzdan, kill-switch'i bu cüzdan kontrol eder), ANCHOR_PRIVATE_KEY.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { loadPolicy } from "../src/config/policy.js";

const pk = (name: string): Hex => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} gerekli`);
  return (v.startsWith("0x") ? v : `0x${v}`) as Hex;
};
const artifact = (name: string) => JSON.parse(readFileSync(`contracts/artifacts/${name}.json`, "utf8")) as { abi: never; bytecode: Hex };

const rpc = process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
const owner = privateKeyToAccount(pk("DEPLOYER_PRIVATE_KEY"));
const anchorer = privateKeyToAccount(pk("ANCHOR_PRIVATE_KEY"));
const pub = createPublicClient({ chain: avalancheFuji, transport: http(rpc) });
const wallet = createWalletClient({ account: owner, chain: avalancheFuji, transport: http(rpc) });
const { hash: policyHash } = loadPolicy();

async function deploy(name: string, args: unknown[]) {
  const a = artifact(name);
  const tx = await wallet.deployContract({ abi: a.abi, bytecode: a.bytecode, args: args as never });
  const r = await pub.waitForTransactionReceipt({ hash: tx });
  if (!r.contractAddress) throw new Error(`${name} deploy başarısız`);
  console.log(`${name}: ${r.contractAddress}  (tx ${tx})`);
  return r.contractAddress;
}

const registry = await deploy("PolicyRegistry", [policyHash]);
const anchor = await deploy("AuditAnchor", [anchorer.address]);
console.log(`\n.env dosyasına ekleyin:\nPOLICY_REGISTRY_ADDRESS=${registry}\nAUDIT_ANCHOR_ADDRESS=${anchor}`);
console.log(`Sahip (kill-switch): ${owner.address}\nAnchor cüzdanı: ${anchorer.address}\nPolicy hash: ${policyHash}`);
