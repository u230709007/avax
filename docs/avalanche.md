# Avalanche — Proof of Guard

## Amaç
Güvenlik iddiasını doğrulanabilir yapmak: çalışan kurallar zincirdeki hash ile eşleşir, kill-switch kullanıcının cüzdanındadır,
her kararın kanıtı Avalanche Fuji'de değiştirilemez şekilde sabitlenir.

## Dosyalar
`contracts/src/PolicyRegistry.sol`, `contracts/src/AuditAnchor.sol`, `contracts/test/Registry.t.sol`, `src/chain/abi.ts`, `src/chain/avalanche.ts`,
`scripts/compile-contracts.ts`, `scripts/deploy-fuji.ts`, `scripts/set-policy-hash.ts`, `scripts/verify-audit.ts`, `web/src/killSwitch.ts`.

## Akış
- **PolicyRegistry**: `policyHash`, `policyVersion`, `paused`, `owner`. `setPolicyHash/pause/unpause` sadece sahip. `state()` tek çağrıda okunur.
  Guardian her işlemde (30 sn cache) yerel `keccak256(policy.json)` ile karşılaştırır.
- **AuditAnchor**: `anchor(root, fromSeq, toSeq)` sadece anchor cüzdanı; aralıklar boşluksuz (`fromSeq == nextSeq`), geçmiş yeniden yazılamaz.
  Guardian her 20 kararda veya 5 dakikada bir yazar (`src/audit/anchorer.ts`).
- **Kill-switch**: arayüzdeki "Zincirden durdur" → Core/MetaMask → `pause()`. Guardian ≤30 sn içinde `PAUSED_ONCHAIN`. Göndermeden önce `web/src/killSwitch.ts` ağı (43113), kontratın varlığını, `owner == bağlı cüzdan`ı ve gas bakiyesini kontrol eder; tx yerine açık hata gösterir. En sık hata: DEPLOYER dışında bir hesapla imzalamak (`NotOwner`).
- **İki ayrı cüzdan**: DEPLOYER (sahip; kill-switch ve policy hash) ve ANCHOR (sadece gas; guardian'da). Trade fonları OKX'te.

Deploy:
```bash
npm run contracts:build            # solc (npm) → contracts/artifacts
npm run deploy:fuji                # DEPLOYER_PRIVATE_KEY, ANCHOR_PRIVATE_KEY; çıktıdaki adresleri .env'e yaz
npm run policy:set-hash            # policy.json değiştiyse
```
Test AVAX: Fuji faucet (core.app). Explorer: https://testnet.snowtrace.io

## Kurallar / sınırlar
- Fuji okunamazsa işlem açılmaz (fail-closed); kapatma serbest.
- Anchor cüzdanı ele geçirilse bile geçmiş kökler değiştirilemez; sadece yeni aralık eklenebilir.

## Nasıl test edilir
`forge test --use <solc>` (8 test). Yerel: `anvil --chain-id 43113` + `FUJI_RPC_URL=http://127.0.0.1:8545` ile deploy → kill-switch → anchor → `/api/verify/:seq` (LEARN L-004).

## Son güncelleme
2026-10-16 · yerel Anvil'de uçtan uca doğrulandı.
