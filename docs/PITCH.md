# Sunum — 6 dakika, 8 sayfa

## Amaç
Otonom AVAX ajanını çalışan örnek olarak kullanarak OKX ajan geliştiricilerine yönelik Guardian servisini anlatmak.

## Dosyalar
`docs/DEMO_SCRIPT.md`, `scripts/demo-check.ts`, `src/guardian.ts`, `contracts/src/IntentGate.sol`.

## Akış
1. **Problem:** Haber/web içeriği ajan tarafından işlem talimatı olarak yorumlanabilir. İlk müşteri OKX üzerinde ajan geliştiren küçük ekiplerdir. Kaynağı doğrulanmamış olay veya zarar rakamı kullanma.
2. **Ürün:** Ajan → Guardian MCP → OKX ATK. Model maskeli portföy ve dar araçlar görür; emri kod üretir. Maskeleme veri maruziyetini azaltır; işlem yetkisini şema ve kurallar sınırlar.
3. **Çalışan ajan:** Tek otonom turda piyasa, portföy, haber ve karar araçlarını göster. İşlem yapmama kararı da geçerlidir. Ayrı kontrollü demo emrinde kabul ile dolumu ayır.
4. **Saldırı:** Gizli talimatlı sayfayı okut, audit'te tarama ve ret/onay nedenini aç. Doğrudan Guardian replay testi, gerçek LLM saldırı başarı oranı değildir.
5. **Avalanche:** IntentGate hash ve pause durumunu aynı zincir işleminde kontrol eder. Guardian kesinleşmeyi bekleyip OKX'e gönderir. RPC dahil ölçülen süre, ağ konsensüs süresi değildir. CEX emri ve zincir işlemi birlikte atomik değildir.
6. **OKX hizmeti:** Harici MCP istemcisinden /atk bağlantısını ve gerçek tool listesini göster. Geçici anahtarı iptal et. Katalog kartı hazırdır; OKX.AI'da listelendiği veya onaylandığı iddia edilmez.
7. **İş modeli:** Sandbox/Pro/Desk fiyatları test edilecek hipotezdir; kota çalışır, ödeme tahsilatı yoktur. Pilot metrikleri: ilk bağlantı süresi, başarılı korunan demo emir, yanlış ret oranı, gecikme ve ödeme isteği.
8. **Kapanış:** “Ajan karar verir; yetkiyi kod sınırlar; kayıt Avalanche'ta doğrulanır.” Gerçek kullanıcı/gelir kanıtı yoksa traction iddiası yok. Pilot çağrısı: kendi ajanını demo hesapla bağla ve aynı test paketini çalıştır.

## Jüri soruları
| Soru | Cevap |
|---|---|
| Maskeleme tek başına yeterli mi? | Hayır; kapalı yetenekler, kurallar ve onayla birlikte kullanılır. |
| Neden Avalanche? | Emir öncesi bağımsız policy/pause kontrolü ve audit kanıtı. Gecikme gerçek ölçümle gösterilir; yaklaşım başka EVM ağlarına taşınabilir. |
| Kontrat tüm kuralları uygular mı? | Hayır; hash ve pause zincirde, fiyat/bakiye/limit kontrolleri Guardian'dadır. |
| Hiç zarar olmaz mı? | Hayır; kurallara uygun işlemler de zarar edebilir. Eşikler garanti edilmiş kayıp tavanı değildir. |
| Sunucu veya API anahtarı ele geçirilirse? | Guardian atlanabilir. Sunucu ve anahtar güvenliği güven modelinin parçasıdır. |
| Tüm kullanıcıların audit'i zincirde mi? | Sahip akışı anchor edilir; kişisel hesaplar şu anda yerel audit zinciri kullanır. |
| İnsan onayı otonomiyi bozar mı? | Temiz, limit içi işlemler otonomdur; yüksek riskte yetki sınırı devreye girer. |
| Müşteri/gelir var mı? | Kanıt yoksa yok denir; fiyat ve talep pilotla doğrulanacaktır. |

## Kurallar / sınırlar
Fuji testnet ve OKX demo kullanılır. Güvenlik sertifikası, kayıpsızlık veya 100 jüri puanı iddiası yoktur.
MCP servis anahtarları sahibin hesabına bağlıdır; kişisel kullanıcı hesabıyla aynı ürün akışı gibi sunulmaz.

## Nasıl test edilir
`npm run demo:check`; kontrollü tek emir için `npm run demo:check -- --trade`. İki zamanlı prova yap, bağımlılık hatalarını gizleme.

## Son güncelleme
2026-10-17 · Kriterlere bağlı anlatım, pilot metrikleri, teknik Q&A ve güven sınırları.

