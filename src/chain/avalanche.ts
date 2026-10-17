// docs: docs/avalanche.md
import {
  BaseError,
  ContractFunctionRevertedError,
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
import { AUDIT_ANCHOR_ABI, INTENT_GATE_ABI, POLICY_REGISTRY_ABI } from "./abi.js";

export const SNOWTRACE_FUJI = "https://testnet.snowtrace.io";

export interface ChainSnapshot extends ChainState {
  onchainHash?: Hex;
  onchainVersion?: number;
  localHash: Hex;
  checkedAt: number;
  error?: string;
}

/** IntentGate yazılamadı: kod, kural motorunun ret kodlarıyla aynı dilde (PAUSED_ONCHAIN, POLICY_HASH_MISMATCH…). */
export class IntentCommitError extends Error {
  constructor(
    readonly code: "INTENT_GATE_UNCONFIGURED" | "INTENT_COMMIT_FAILED" | "PAUSED_ONCHAIN" | "POLICY_HASH_MISMATCH",
    message: string,
  ) {
    super(message);
  }
}

export interface ChainConfig {
  rpcUrl: string;
  policyRegistry?: Address;
  auditAnchor?: Address;
  intentGate?: Address;
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
  private writeQueue: Promise<unknown> = Promise.resolve();

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

  /** Anchor ve intent commit aynı cüzdanı kullanır: yazmalar sırayla gider, nonce çakışmaz. */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.writeQueue.then(fn, fn);
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  async anchor(root: Hex, fromSeq: number, toSeq: number): Promise<Hex> {
    if (!this.wallet?.account || !this.cfg.auditAnchor) throw new Error("Anchor cüzdanı veya AUDIT_ANCHOR_ADDRESS yok");
    const wallet = this.wallet;
    const address = this.cfg.auditAnchor;
    return this.serial(async () => {
      const hash = await wallet.writeContract({
        address,
        abi: AUDIT_ANCHOR_ABI,
        functionName: "anchor",
        args: [root, BigInt(fromSeq), BigInt(toSeq)],
        account: wallet.account!,
        chain: avalancheFuji,
      });
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`anchor tx başarısız: ${hash}`);
      return hash;
    });
  }

  get intentGate(): Address | undefined {
    return this.cfg.intentGate;
  }

  /**
   * Emirden önce niyet hash'ini IntentGate'e yazar ve kesinleşmeyi bekler. Kontrat kill-switch'i ve policy
   * hash'ini aynı işlemde kontrol eder; durdurulmuşsa simülasyon `PausedOnchain` ile düşer ve emir gitmez.
   */
  async commitIntent(intentHash: Hex): Promise<{ txHash: Hex; ms: number }> {
    if (!this.wallet?.account || !this.cfg.intentGate) throw new IntentCommitError("INTENT_GATE_UNCONFIGURED", "INTENT_GATE_ADDRESS veya anchor cüzdanı yok");
    const wallet = this.wallet;
    const address = this.cfg.intentGate;
    return this.serial(async () => {
      const t0 = performance.now();
      try {
        const { request } = await this.publicClient.simulateContract({
          address,
          abi: INTENT_GATE_ABI,
          functionName: "commit",
          args: [intentHash, this.cfg.localPolicyHash],
          account: wallet.account!,
          chain: avalancheFuji,
        });
        const txHash = await wallet.writeContract(request);
        const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash, pollingInterval: 250 });
        if (receipt.status !== "success") throw new IntentCommitError("INTENT_COMMIT_FAILED", `tx başarısız: ${txHash}`);
        return { txHash, ms: Math.round(performance.now() - t0) };
      } catch (e) {
        if (e instanceof IntentCommitError) throw e;
        const name = e instanceof BaseError ? (e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null)?.data?.errorName : undefined;
        if (name === "PausedOnchain") throw new IntentCommitError("PAUSED_ONCHAIN", "IntentGate: kill-switch açık");
        if (name === "PolicyMismatch") throw new IntentCommitError("POLICY_HASH_MISMATCH", "IntentGate: policy hash eşleşmiyor");
        throw new IntentCommitError("INTENT_COMMIT_FAILED", (e as Error).message.slice(0, 200));
      }
    });
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
