import { createPublicClient, createWalletClient, custom, formatEther, parseAbi, type Address, type EIP1193Provider } from "viem";
import { avalancheFuji } from "viem/chains";

const ABI = parseAbi(["function pause()", "function unpause()", "function owner() view returns (address)"]);

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

/**
 * Zincir üstü kill-switch: tx kullanıcının kendi cüzdanından (Core/MetaMask) imzalanır.
 * Guardian'ın ve LLM'in bu kanala hiçbir erişimi yoktur.
 * Göndermeden önce ağ, kontrat, sahiplik ve gas kontrol edilir; tx'in neden başarısız olacağı açıkça söylenir.
 */
export async function setPaused(registry: Address, paused: boolean): Promise<string> {
  if (!window.ethereum) throw new Error("Tarayıcıda Core veya MetaMask cüzdanı bulunamadı");
  const wallet = createWalletClient({ chain: avalancheFuji, transport: custom(window.ethereum) });
  const [account] = await wallet.requestAddresses();
  if (!account) throw new Error("Cüzdan hesabı seçilmedi");
  await wallet.switchChain({ id: avalancheFuji.id }).catch(async () => {
    await wallet.addChain({ chain: avalancheFuji });
    await wallet.switchChain({ id: avalancheFuji.id });
  });
  const reader = createPublicClient({ chain: avalancheFuji, transport: custom(window.ethereum) });
  if ((await reader.getChainId()) !== avalancheFuji.id) throw new Error("Cüzdan Avalanche Fuji (43113) ağında değil");

  const code = await reader.getCode({ address: registry });
  if (!code || code === "0x") throw new Error(`PolicyRegistry Fuji'de bulunamadı (${registry}). Kontrat bu ağda deploy edilmemiş; POLICY_REGISTRY_ADDRESS'i kontrol et`);

  const owner = await reader.readContract({ address: registry, abi: ABI, functionName: "owner" });
  if (owner.toLowerCase() !== account.toLowerCase()) {
    throw new Error(`Bağlı cüzdan (${short(account)}) kontratın sahibi değil. Kill-switch'i sadece deploy eden cüzdan (${short(owner)}) çalıştırabilir; cüzdanda o hesaba geç`);
  }

  const balance = await reader.getBalance({ address: account });
  if (balance === 0n) throw new Error(`Cüzdanda Fuji AVAX yok (gas için gerekli). Faucet: https://core.app/tools/testnet-faucet`);

  const fn = paused ? "pause" : "unpause";
  try {
    await reader.simulateContract({ address: registry, abi: ABI, functionName: fn, account });
  } catch (e) {
    throw new Error(`İşlem zincirde reddedilecek: ${(e as Error).message.split("\n")[0]} (bakiye ${formatEther(balance)} AVAX)`);
  }

  const hash = await wallet.writeContract({ address: registry, abi: ABI, functionName: fn, account, chain: avalancheFuji });
  const receipt = await reader.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`İşlem zincirde başarısız oldu: ${hash}`);
  return hash;
}

function short(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
