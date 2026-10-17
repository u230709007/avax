// docs: docs/avalanche.md
/** policy.json değiştiğinde yeni hash'i sahip cüzdanla PolicyRegistry'ye yazar. Yazılmadan guardian işlem açmaz. */
import "dotenv/config";
import { createPublicClient, createWalletClient, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import { loadPolicy } from "../src/config/policy.js";
import { POLICY_REGISTRY_ABI } from "../src/chain/abi.js";

const v = process.env.DEPLOYER_PRIVATE_KEY;
const registry = process.env.POLICY_REGISTRY_ADDRESS as Address | undefined;
if (!v || !registry) throw new Error("DEPLOYER_PRIVATE_KEY ve POLICY_REGISTRY_ADDRESS gerekli");
const account = privateKeyToAccount((v.startsWith("0x") ? v : `0x${v}`) as Hex);
const rpc = process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc";
const pub = createPublicClient({ chain: avalancheFuji, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: avalancheFuji, transport: http(rpc) });

const { hash, policy } = loadPolicy();
const [current] = await pub.readContract({ address: registry, abi: POLICY_REGISTRY_ABI, functionName: "state" });
if (current.toLowerCase() === hash.toLowerCase()) {
  console.log(`Zincirdeki hash zaten güncel: ${hash}`);
} else {
  const tx = await wallet.writeContract({ address: registry, abi: POLICY_REGISTRY_ABI, functionName: "setPolicyHash", args: [hash] });
  await pub.waitForTransactionReceipt({ hash: tx });
  console.log(`policy v${policy.version} hash'i yazıldı: ${hash}\ntx: https://testnet.snowtrace.io/tx/${tx}`);
}
