// docs: docs/avalanche.md
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";
import type { ChainState } from "../policy/rules.js";
import { AUDIT_ANCHOR_ABI, POLICY_REGISTRY_ABI } from "./abi.js";

export const SNOWTRACE_FUJI = "https://testnet.snowtrace.io";

export interface ChainSnapshot extends ChainState {
  onchainHash?: Hex;
  onchainVersion?: number;
  localHash: Hex;
  checkedAt: number;
  error?: string;
}

export interface ChainConfig {
  rpcUrl: string;
  policyRegistry?: Address;
  auditAnchor?: Address;
  anchorPrivateKey?: Hex;
  localPolicyHash: Hex;
  cacheSeconds: number;
}

/**
 * Avalanche Fuji ile tek temas noktası. PolicyRegistry okunamazsa durum `reachable=false`
 * olur ve kural motoru işlem açmayı reddeder (fail-closed).
 */
export class AvalancheGuard {
  readonly publicClient: PublicClient;
  private readonly wallet: WalletClient | undefined;
  private cached: ChainSnapshot | undefined;

  constructor(private readonly cfg: ChainConfig) {
    this.publicClient = createPublicClient({ chain: avalancheFuji, transport: http(cfg.rpcUrl) }) as PublicClient;
    if (cfg.anchorPrivateKey) {
      this.wallet = createWalletClient({
        account: privateKeyToAccount(cfg.anchorPrivateKey),
        chain: avalancheFuji,
        transport: http(cfg.rpcUrl),
      });
    }
  }

  get policyRegistry(): Address | undefined {
    return this.cfg.policyRegistry;
  }

  get auditAnchor(): Address | undefined {
    return this.cfg.auditAnchor;
  }

  async state(force = false): Promise<ChainSnapshot> {
    const now = Date.now();
    if (!force && this.cached && now - this.cached.checkedAt < this.cfg.cacheSeconds * 1000) return this.cached;
    const base = { localHash: this.cfg.localPolicyHash, checkedAt: now };
    if (!this.cfg.policyRegistry) {
      this.cached = { ...base, reachable: false, policyHashMatches: false, paused: true, error: "POLICY_REGISTRY_ADDRESS tanımlı değil" };
      return this.cached;
    }
    try {
      const [hash, version, paused] = await this.publicClient.readContract({
        address: this.cfg.policyRegistry,
        abi: POLICY_REGISTRY_ABI,
        functionName: "state",
      });
      this.cached = {
        ...base,
        reachable: true,
        onchainHash: hash,
        onchainVersion: Number(version),
        policyHashMatches: hash.toLowerCase() === this.cfg.localPolicyHash.toLowerCase(),
        paused,
      };
    } catch (e) {
      this.cached = { ...base, reachable: false, policyHashMatches: false, paused: true, error: (e as Error).message.slice(0, 200) };
    }
    return this.cached;
  }

  async anchorNextSeq(): Promise<number> {
    if (!this.cfg.auditAnchor) throw new Error("AUDIT_ANCHOR_ADDRESS tanımlı değil");
    const n = await this.publicClient.readContract({ address: this.cfg.auditAnchor, abi: AUDIT_ANCHOR_ABI, functionName: "nextSeq" });
    return Number(n);
  }

  async anchor(root: Hex, fromSeq: number, toSeq: number): Promise<Hex> {
    if (!this.wallet?.account || !this.cfg.auditAnchor) throw new Error("Anchor cüzdanı veya AUDIT_ANCHOR_ADDRESS yok");
    const hash = await this.wallet.writeContract({
      address: this.cfg.auditAnchor,
      abi: AUDIT_ANCHOR_ABI,
      functionName: "anchor",
      args: [root, BigInt(fromSeq), BigInt(toSeq)],
      account: this.wallet.account,
      chain: avalancheFuji,
    });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`anchor tx başarısız: ${hash}`);
    return hash;
  }

  async readAnchor(index: number): Promise<{ root: Hex; fromSeq: number; toSeq: number; timestamp: number }> {
    if (!this.cfg.auditAnchor) throw new Error("AUDIT_ANCHOR_ADDRESS tanımlı değil");
    const a = await this.publicClient.readContract({
      address: this.cfg.auditAnchor,
      abi: AUDIT_ANCHOR_ABI,
      functionName: "get",
      args: [BigInt(index)],
    });
    return { root: a.root, fromSeq: Number(a.fromSeq), toSeq: Number(a.toSeq), timestamp: Number(a.timestamp) };
  }

  async anchorCount(): Promise<number> {
    if (!this.cfg.auditAnchor) return 0;
    return Number(await this.publicClient.readContract({ address: this.cfg.auditAnchor, abi: AUDIT_ANCHOR_ABI, functionName: "count" }));
  }
}
