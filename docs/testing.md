# Test

## Amaç
Neyin nasıl test edildiği ve doküman kontrolleri.

## Dosyalar
`tests/unit/*.test.ts`, `tests/fixtures/*` (sadece testler), `tests/integration/live.test.ts`, `contracts/test/Registry.t.sol`,
`scripts/docs-check.ts`, `scripts/docs-check-lib.ts`, `vitest.config.ts`, `vitest.integration.config.ts`.

## Akış
| Komut | Ne | Ağ |
|---|---|---|
| `npm test` | 60 birim test: vault, policy, sanitize + saldırı sayfaları, guardian (test çifti ile), audit/Merkle, docs:check | yok |
| `npm run typecheck` | sunucu TS | yok |
| `npx tsc -p web/tsconfig.json` | arayüz TS | yok |
| `forge test --use <solc>` | 8 kontrat testi (yetki, boşluksuz anchor) | yok |
| `npm run test:integration` | gerçek ATK + OKX demo + Fuji + Anthropic; ortam yoksa atlanır | var |
| `npm run attack:replay` | gerçek guardian'a saldırı tablosu | OKX/Fuji |
| `npm run docs:check` | satır sınırları, modül haritası, INDEX, kaynak başlıkları, CLAUDE.md güncelliği | yok |

## Kurallar / sınırlar
- Fixture'lar uygulamaya hiç yüklenmez; uygulama ve arayüz mock veri kullanmaz.
- Guardian birim testleri ATK/zincir yerine fixture dönen test çifti kullanır; canlı davranış entegrasyon testindedir.
- Bulut ortamında OKX/Fuji engelli: zincir için Anvil (LEARN L-004).

## Nasıl test edilir
Yukarıdaki tablo. Son çalıştırma: 60/60 birim, 8/8 forge, entegrasyon 3 geçti / 2 OKX ağı yok / 2 Anthropic anahtarı yok.

## Son güncelleme
2026-10-16 · ilk sürüm.
