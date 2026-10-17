# Jüri kriterleri — kanıt ve açık işler

## Amaç
Puan vaat etmek yerine her kriter için doğrulanabilir kanıt ve eksik koşulları izlemek.
Kaynak: https://docs.google.com/spreadsheets/d/1hWI89BTn9CeXJiSpgLvc1FWdoYYT9uIibpQ07jg9ZC0/edit?gid=167640646

## Dosyalar
`scripts/demo-check.ts`, `docs/PITCH.md`, `docs/DEMO_SCRIPT.md`, `tests/unit/atkTools.test.ts`.

## Akış
| Kriter | Ağırlık | Mevcut kanıt | Kapanmamış koşul |
|---|---|---|---|
| Agentic Design | 20 | Zamanlanmış tur, MCP araçları, canlı LLM entegrasyon testi | Tam otonom tur ile kabul/dolum bağlantısının kaydı |
| Technical Execution | 15 | 124 birim, 7 canlı entegrasyon; typecheck ve web build geçti | Herkese açık uçtan uca deployment ve kişisel hesap provası |
| Avalanche Integration | 10 | Çalışan sunucuda Fuji v5 hash eşleşmesi, IntentGate, audit bütünlüğü | Jüri için tx/audit/emir eşleşmesi; testnet kabul koşulu |
| OKX Integration | 10 | Gerçek ATK; harici MCP istemci bağlantısı, 13 araç, piyasa okuması; geçici anahtar iptali | 54092 kalktıktan sonra emir dolumu; OKX.AI listelemesi doğrulanmadı |
| Innovation & Real-World Value | 25 | Dar yetenek + maskeleme + deterministik kurallar + zincir kanıtı; fiyat/kota modeli | Gerçek pilot, ödeme isteği, üretim güvenliği ve faturalama |
| Demo & Presentation | 20 | Altı dakikalık senaryo, hedef müşteri ve Q&A hazır | İki zamanlı prova, UX kullanıcı testi, başarılı emir kaydı |

## 2026-10-17 koşusu
- `npm test`: 124/124; `npm run typecheck`: geçti.
- `npm run test:integration`: 7/7 gerçek OKX demo/Fuji/LLM kontrolü; emir dolumu testi değildir.
- `npm run web:build`: geçti; büyük ana JS paketi uyarısı sürüyor.
- `npm run demo:check -- --trade`: transport, policy, audit, MCP, piyasa ve anahtar iptali geçti. Tek yaklaşık 5 USDT demo emir OKX 54092 ile reddedildi (audit seq 200). Kullanıcı onay verdiğini belirtti; yeniden deneme yine aynı hatayı verdi.
- Replay ayrı `data/assessment-replay-20261017.db` ile çalıştırıldı: 3 içerik özeti, 7 ret. Retlerden biri `SIGNAL_NOT_CONFIRMED`; bu güvenlik saldırısı başarı istatistiği sayılmaz. Gerçek rapor `data/attack-replay.json`.
- Çalışan sunucu güncel policy v5 ile eşleşiyor. Bu oturumdaki yeni kaynak değişiklikleri yeniden başlatılmadan çalışan backend'e geçmez.

## Pilot doğrulama planı
1. Üç gerçek ajan geliştiricisiyle görüşme: mevcut güvenlik yöntemi, ilk entegrasyon süresi, yaşadığı hata ve ödeme isteği. Görüşmeler henüz yapılmadı.
2. Demo hesapla bir pilot: başlangıç/bitiş zamanı, tool keşfi, ret nedeni, borsa kabulü, dolum, audit ve tx kaydı. Ham bakiye/anahtar yayımlanmaz.
3. Temiz istek ve saldırı senaryolarını ayır; yanlış ret ve erişim hatalarını saldırı engelleme oranına katma.
4. Fiyatları maliyet ve müşteri görüşmeleriyle doğrula; tahsilat entegrasyonu olmadan gelir iddiası yapma.

## Kurallar / sınırlar
100 puan, müşteri kabulü ve jüri kararı garanti edilemez. Açık satırlar tamamlandı olarak işaretlenmez.
OKX feragatnamesi hesap sahibinin işlemidir. Üretim hesabı, gerçek para veya policy gevşetmesi kullanılmaz.

## Nasıl test edilir
`npm run demo:check` ve yetkili kontrollü emir için `npm run demo:check -- --trade`; diğer kontroller runbook'ta.

## Son güncelleme
2026-10-17 · Kriter bazlı kanıt ve açık işler; canlı koşu sonuçları.
