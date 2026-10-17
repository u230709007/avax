import { createPublicClient, createWalletClient, custom, http, parseAbi, type Address, type EIP1193Provider } from "viem";
import { avalancheFuji } from "viem/chains";

const ABI = parseAbi(["function pause()", "function unpause()"]);

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/**
 * Zincir üstü kill-switch: tx kullanıcının kendi cüzdanından (Core/MetaMask) imzalanır.
 * Guardian'ın ve LLM'in bu kanala hiçbir erişimi yoktur.
 */
export async function setPaused(registry: Address, paused: boolean): Promise<string> {
  if (!window.ethereum) throw new Error("Tarayıcıda Core veya MetaMask cüzdanı bulunamadı");
  const wallet = createWalletClient({ chain: avalancheFuji, transport: custom(window.ethereum) });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error("Cüzdan hesabı seçilmedi");
  await wallet.switchChain({ id: avalancheFuji.id }).catch(async () => {
    await wallet.addChain({ chain: avalancheFuji });
  });
  const hash = await wallet.writeContract({ address: registry, abi: ABI, functionName: paused ? "pause" : "unpause", account, chain: avalancheFuji });
  await createPublicClient({ chain: avalancheFuji, transport: http() }).waitForTransactionReceipt({ hash });
  return hash;
}
