# Demo senaryosu — yaklaşık 6 dakika

## Amaç
Çalışan ajanı, kodla uygulanan yetki sınırlarını ve doğrulanabilir kayıtları göstermek.

## Dosyalar
`docs/PITCH.md`, `scripts/demo-check.ts`, `examples/attack-replay.ts`, `src/runtime.ts`.

## Akış
| Zaman | Gösterilecek kanıt |
|---|---|
| 0:00 | Problem ve ilk müşteri: OKX üzerinde ajan geliştiren ekipler. |
| 0:30 | OKX demo, Fuji policy eşleşmesi; demo:check ile harici MCP bağlantısı. |
| 1:00 | Tek otonom tur: piyasa → portföy → haber → karar; gerçek tool çağrıları. Bekleme geçerlidir, işlem zorlamak için policy gevşetilmez. |
| 2:00 | Önceden yetkilendirilmiş tek küçük demo emir: npm run demo:check -- --trade. Onay gerekirse kullanıcı UI'dan karar verir. |
| 2:45 | OKX demo emir geçmişinde dolum/iptal durumu; IntentGate tx ve audit kaydı. ALLOWED dolum kanıtı değildir. |
| 3:15 | Maskeli portföy ile yerel gerçek değer görünümünü karşılaştır. |
| 3:45 | localhost:7071/morse.html sayfasını okut; audit bayraklarını ve sonraki kararın gerçek nedenini göster. |
| 4:30 | Önceden üretilmiş replay raporunun zamanını ve policy sürümünü göster. Replay gerçek LLM saldırı ölçümü değildir. |
| 5:00 | Kullanıcı cüzdanından pause; yeni önerinin reddi. Prova sonunda kullanıcı unpause yapar. |
| 5:30 | Kanıt paneli, doğrulanmış audit kaydı, /mcp/info, pilot çağrısı. |

## Kurallar / sınırlar
- Canlı sunucu açıkken aynı DB ile attack:replay çalıştırma. Ayrı DB ile önceden prova yap veya sunucuyu kontrollü durdur.
- Reddedilen emir, ağ hatası veya bekleyen onayı başarı olarak sunma.
- 54092: API anahtarının demo ana/alt hesabında Spot feragatnamesi gerekir.
- Ağ kesilirse tarihli gerçek koşu kaydı göster; canlı olmadığını belirt.
- Kill-switch önceden gönderilmiş OKX emrini geri almaz; CEX ile zincir tek atomik işlem değildir.
- Yalnızca 7072 kanıt/servis kapısını paylaş; 7070 yönetim erişimini paylaşma.

## Nasıl test edilir
İki zamanlı prova; test, typecheck, entegrasyon ve demo-check raporlarını sakla. OKX geçmişi, tx ve audit seq aynı işlemle eşleşmeli.

## Son güncelleme
2026-10-17 · Kabul/dolum ayrımı, güvenli replay, harici MCP testi ve hata senaryosu.

