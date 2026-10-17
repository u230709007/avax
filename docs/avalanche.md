# Avalanche — Proof of Guard

## Amaç
Güvenlik iddiasını doğrulanabilir yapmak: çalışan kurallar zincirdeki hash ile eşleşir, kill-switch kullanıcının cüzdanındadır,
her kararın kanıtı Avalanche Fuji'de değiştirilemez şekilde sabitlenir.

## Dosyalar
`contracts/src/PolicyRegistry.sol`, `contracts/src/AuditAnchor.sol`, `contracts/src/IntentGate.sol`, `contracts/test/Registry.t.sol`, `contracts/test/IntentGate.t.sol`, `src/chain/abi.ts`, `src/chain/avalanche.ts`,
`scripts/compile-contracts.ts`, `scripts/deploy-fuji.ts`, `scripts/deploy-intent-gate.ts`, `scripts/killswitch-latency.ts`, `scripts/set-policy-hash.ts`, `scripts/verify-audit.ts`, `web/src/killSwitch.ts`.

## Akış
- **PolicyRegistry**: `policyHash`, `policyVersion`, `paused`, `owner`. `setPolicyHash/pause/unpause` sadece sahip. `state()` tek çağrıda okunur.
  Guardian her işlemde (30 sn cache) yerel `keccak256(policy.json)` ile karşılaştırır.
- **AuditAnchor**: `anchor(root, fromSeq, toSeq)` sadece anchor cüzdanı; aralıklar boşluksuz (`fromSeq == nextSeq`), geçmiş yeniden yazılamaz.
  Guardian her 20 kararda veya 5 dakikada bir yazar (`src/audit/anchorer.ts`).
- **IntentGate** (policy `intentCommit: true`): guardian emri ürettikten sonra, OKX'e göndermeden ÖNCE `commit(intentHash, policyHash)` yazar ve
  kesinleşmeyi bekler. Kontrat aynı işlemde `PolicyRegistry.state()` okur: durdurulmuşsa `PausedOnchain`, hash farklıysa `PolicyMismatch` ile düşer
  → emir gitmez (`PAUSED_ONCHAIN` / `POLICY_HASH_MISMATCH` / `INTENT_COMMIT_FAILED`, fail-closed). Önbellek yok: kill-switch bir sonraki blokta etkili.
  `intentHash = keccak256(emir parametreleri + policy sürümü + nonce)`; OKX `clOrdId = "g" + hash'in ilk 31 hex'i` → borsa emri zincir kaydına bağlı.
  Aynı hash ikinci kez yazılamaz (`AlreadyCommitted`). Committer = ANCHOR cüzdanı; anchor ve commit yazmaları sıraya alınır (nonce çakışmaz).
  Bu, Avalanche'ın alt-saniye kesinleşmesini her emrin yoluna koyar: Fuji'de ölçülen uçtan uca süre ~3,5–4,5 sn (genel RPC, gönder+makbuz).
- **Kill-switch**: arayüzdeki "Zincirden durdur" → Core/MetaMask → `pause()`. IntentGate yeni emri bir sonraki blokta reddeder; okuma tarafı ≤30 sn
  içinde `PAUSED_ONCHAIN` gösterir. Ölçüm: `npm run killswitch:measure` (pause → IntentGate reddi → unpause; `data/killswitch-latency.json`).
  2026-10-17 Fuji: pause kesinleşme 3.521 ms, IntentGate reddi 3.615 ms, unpause 2.579 ms.
- **İki ayrı cüzdan**: DEPLOYER (sahip; kill-switch ve policy hash) ve ANCHOR (sadece gas; guardian'da). Trade fonları OKX'te.

Deploy:
```bash
npm run contracts:build            # solc (npm) → contracts/artifacts
npm run deploy:fuji                # DEPLOYER_PRIVATE_KEY, ANCHOR_PRIVATE_KEY; çıktıdaki adresleri .env'e yaz
npm run deploy:intent-gate         # IntentGate (PolicyRegistry'ye bağlı); INTENT_GATE_ADDRESS'i .env'e yaz
npm run policy:set-hash            # policy.json değiştiyse
```
Test AVAX: Fuji faucet (core.app). Explorer: https://testnet.snowtrace.io

## Kurallar / sınırlar
- Fuji okunamazsa işlem açılmaz (fail-closed); kapatma serbest.
- Anchor cüzdanı ele geçirilse bile geçmiş kökler değiştirilemez; sadece yeni aralık eklenebilir.

## Nasıl test edilir
`forge test --use <solc>` (8 test). Yerel: `anvil --chain-id 43113` + `FUJI_RPC_URL=http://127.0.0.1:8545` ile deploy → kill-switch → anchor → `/api/verify/:seq` (LEARN L-004).

## Son güncelleme
2026-10-17 · IntentGate (emir öncesi zincir kaydı) Fuji'de: 0x4dd6528f745cfe5c0fc8a5939b674d75b1ff529c; policy v3 zincirde; kill-switch ölçümü. Öncesi: Fuji'de canlı: deploy, policy eşleşmesi, 5+ anchor, `audit:verify` DOĞRULANDI, pause → `PAUSED_ONCHAIN` → unpause.
