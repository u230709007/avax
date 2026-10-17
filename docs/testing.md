# Test

## Amaç
Neyin nasıl test edildiği ve doküman kontrolleri.

## Dosyalar
`tests/unit/*.test.ts`, `tests/fixtures/*` (sadece testler), `tests/integration/live.test.ts`, `contracts/test/Registry.t.sol`, `contracts/test/IntentGate.t.sol`,
`scripts/docs-check.ts`, `scripts/docs-check-lib.ts`, `vitest.config.ts`, `vitest.integration.config.ts`.

## Akış
| Komut | Ne | Ağ |
|---|---|---|
| `npm test` | 90 birim test: vault, policy, sanitize + saldırı sayfaları, guardian (test çifti ile; taint, IntentGate), servis (anahtar/kota/MCP), audit/Merkle, docs:check | yok |
| `npm run typecheck` | sunucu TS | yok |
| `npx tsc -p web/tsconfig.json` | arayüz TS | yok |
| `forge test --use <solc>` | 13 kontrat testi (yetki, boşluksuz anchor, IntentGate kill-switch/replay) | yok |
| `npm run killswitch:measure` | Fuji'de pause → IntentGate reddi → unpause süresi | Fuji |
| `npm run test:integration` | gerçek ATK + OKX demo + Fuji + aktif LLM (varsayılan Groq); ortam yoksa atlanır | var |
| `npm run attack:replay` | gerçek guardian'a saldırı tablosu | OKX/Fuji |
| `npm run docs:check` | satır sınırları, modül haritası, INDEX, kaynak başlıkları, CLAUDE.md güncelliği | yok |

## Kurallar / sınırlar
- Fixture'lar uygulamaya hiç yüklenmez; uygulama ve arayüz mock veri kullanmaz.
- Guardian birim testleri ATK/zincir yerine fixture dönen test çifti kullanır; canlı davranış entegrasyon testindedir.
- Bulut ortamında OKX/Fuji engelli: zincir için Anvil (LEARN L-004).

## Nasıl test edilir
Yukarıdaki tablo. Son çalıştırma (Windows PC, 2026-10-17): 90/90 birim, 13/13 forge, servis kapısı canlı duman testi (MCP initialize/list/call); önceki: 65/65 birim, 8/8 forge, 7/7 entegrasyon (Groq), attack:replay 9/9 durduruldu.

## Son güncelleme
2026-10-17 · servis + IntentGate testleri (90 birim, 13 forge). Öncesi: PC'de tüm katmanlar yeşil; Foundry Windows'a kuruldu.
