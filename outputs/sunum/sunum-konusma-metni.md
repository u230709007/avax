# Sealed Intent Guardian — Sunum konuşma metni

Türkçe jüri sunumu · 8 slayt · yaklaşık 7 dakika (90 saniyelik demo dahil)

## 1. Sealed Intent Guardian (0:00–0:35)

Merhaba. Sealed Intent Guardian, yapay zekâ ile işlem yapan ajanların yetkilerini sınırlandıran bir proje. Ajan piyasa verisini değerlendiriyor ve işlem öneriyor. Ancak borsaya gidecek emri ayrı bir güvenlik katmanı oluşturuyor. OKX Agent Trade Kit ile emir yürütmeyi, Avalanche Fuji ile zincir üstü kontrol ve kanıtı bir araya getiriyoruz. Bugün göstereceğimiz sürüm OKX demo hesabında çalışıyor. Temel sorumuz şu: Bir ajan yanlış yönlendirilirse hangi işlemleri yine de yapamamalı?

## 2. Problem: dış içerik işlem talimatına dönüşebilir (0:35–1:15)

Trade ajanları haber, web sayfası ve dış araç çıktısı okuyor. Bu içeriklerin içinde ajanı kendi görevinden saptırmaya çalışan talimatlar bulunabilir. Örneğin bir sayfa, tüm bakiyeyle yüksek kaldıraçlı işlem açılmasını isteyebilir. Biz saldırıyı yalnızca modelin fark etmesine güvenmiyoruz. Tehdit modelimizde dil modelinin tamamen kandırıldığını varsayıyoruz. Böyle bir durumda bile çağrının izin verilen araçlara, şemaya ve işlem limitlerine uyması gerekiyor. Bu sunumdaki saldırılar proje içindeki kontrollü test senaryoları. Gerçek olaylara ilişkin doğrulanmamış tarih veya kayıp tutarı kullanmıyoruz.

## 3. Ajan önerir, Guardian emri oluşturur (1:15–2:05)

Akış dört adımda ilerliyor. Önce ajan, gerçek hesap tanımlayıcıları yerine P_AVAX ve ORD gibi maskeli değerlerle çalışıyor. Bakiyeyi de doğrudan sayısal tutar olarak görmüyor. Ardından Guardian gelen niyeti doğruluyor. Para çekme veya transfer aracı bu dar araç kümesinde bulunmuyor. Kurallar izin verirse kod gerçek emir parametrelerini hazırlıyor. IntentGate etkin olduğunda, emir OKX’e gitmeden önce zincir kaydını bekliyoruz. Son adımda ATK emri yürütüyor. Web içeriği ayrı bir karantina aşamasından geçiyor. Kodda Groq, Gemini ve Anthropic sağlayıcıları bulunuyor. Güvenlik kuralları seçilen sağlayıcının dışında çalışıyor.

## 4. İşlem sınırları kodda tanımlı (2:05–2:55)

Bu slayttaki değerler mevcut policy v5 dosyasından geliyor. Bir emrin nominal değeri 50 USDT’yi ve özsermayenin yüzde 20’sini aşamıyor. Son 24 saatin toplam hacim limiti 300 USDT. Dakikada iki emir ve en fazla üç kat kaldıraç sınırı var. 25 USDT üzerindeki işlemler insan onayı istiyor. Web sayfası veya işaretli içerik sonrası ek onay ve piyasa sinyali kontrolleri de devreye giriyor. Stop-loss şu an swap işlemleri için zorunlu, spot için değil. Günlük zarar yüzde beş eşiğine ulaştığında yeni işlem önerileri engelleniyor. Bu eşik toplam zararın kesin olarak yüzde beşte kalacağını garanti etmiyor. Açık pozisyonlar ve piyasa hareketleri risk taşımaya devam ediyor.

## 5. Avalanche emir öncesinde kontrol sağlar (2:55–3:45)

Avalanche burada işlem yolunun bir parçası. PolicyRegistry, izin verilen kuralların hash’ini ve durdurma durumunu tutuyor. Guardian her yeni emir için IntentGate’e niyet kaydı gönderiyor. Kontrat durdurma durumunu ve policy hash’ini aynı işlemde kontrol ediyor. Bu adım başarısız olursa emir gönderilmiyor. Projede kayıtlı 17 Ekim Fuji testinde, pause gönderiminden kapının engellemesine kadar geçen süre 3,615 saniye. Bu tek bir test ölçümü, ağın genel performans garantisi değil. AuditAnchor ise sahibin karar kayıtlarına ait Merkle köklerini zincire yazıyor. Kişisel kullanıcıların audit kayıtları mevcut sürümde yerel hash zinciri olarak kalıyor. Borsadaki işlem fonları OKX hesabında tutuluyor.

## 6. Demo: öneri, saldırı ve doğrulama (3:45–5:15)

Şimdi kısa demoya geçiyorum. Önce bakiye görünümünde kullanıcının gördüğü değerle LLM’e giden maskeli veriyi karşılaştırıyorum. Ardından kararlar ekranında normal bir işlem önerisinin kural sonucunu gösteriyorum. İşlemin gerçekleşmesini önceden vaat etmiyoruz çünkü güncel piyasa koşulları da kontrol ediliyor. Sonra kayıtlı saldırı tablosunu açıyorum. Burada 125 kat kaldıraç isteği LEVERAGE_EXCEEDED ile, yüzde 90 bakiye isteği SIZE_EXCEEDED ile, transfer alanı ekleme girişimi SCHEMA_INVALID ile reddedilmiş. On senaryonun yedisi ret, üçü işaretli içerik özeti üretmiş. Son olarak kanıt panelinden bir zincir kaydını veya audit doğrulamasını gösteriyorum. Bu sonuçlar belirli testlerin kanıtı, bütün olası saldırıların engellendiği iddiası değil.

## 7. Ürün modeli: ajanlar için MCP servisi (5:15–6:00)

Ürünü başka ajanların bağlanabileceği bir MCP güvenlik servisi olarak konumlandırıyoruz. Hedef kullanıcılarımız trade ajanı geliştiricileri ve ajanlara sınırlı yetki vermek isteyen ekipler. Mevcut kod API anahtarı, kota ve kullanım sayacı içeriyor. Önerilen modelde ücretsiz Sandbox günde beş korunan işlem sunuyor. Pro ajan başına aylık 29 dolar, Desk ise korunan işlem başına beş sent olarak tasarlanmış. Bunlar gelir elde edildiği anlamına gelmiyor, faturalama henüz uygulanmadı. Ayrıca sayaç tanımı, kurallardan geçen veya onay bekleyen önerileri kapsıyor. Reddedilen saldırılar işlem kotasına sayılmıyor. Uzak MCP kapısı şu an sahibin Guardian örneğine bağlı.

## 8. Sonraki adım: üretime hazırlık (6:00–6:50)

Mevcut sürümde ajan akışı, deterministik kurallar ve Fuji üzerindeki emir kapısı bir araya geliyor. Kişisel hesaplar için ayrı Guardian ve veritabanı altyapısı da mevcut, ancak gerçek kullanıcı hesabıyla uçtan uca doğrulama henüz tamamlanmış değil. Sıradaki işlerden biri her kullanıcı için ayrı zincir üstü audit akışı. Ayrıca kiracıya özel MCP erişimi, faturalama ve üretim güvenlik incelemesi gerekiyor. Sınırımızı açık koyuyoruz: Kurallara uygun kötü işlemler zarar ettirebilir. OKX anahtarı ele geçirilirse saldırgan Guardian’ı atlayabilir. Sağladığımız değer, ajanın işlem yetkisini kodla sınırlamak ve bu kararları incelenebilir hale getirmek. Teşekkür ederim, sorularınızı alabilirim.

## Demo sırasında yapılacaklar

1. Sunumdan önce OKX demo bağlantısını, Fuji policy eşleşmesini ve panel erişimini kontrol et. Açık hesap değerlerini paylaşacağın ekranda gözden geçir.
2. Slayt 6'da paneli aç. Genel bakış ve LLM'e giden maskeli veriyi göster (20 sn).
3. Kararlar'dan mevcut normal işlem kaydını aç (20 sn). Yeni işlem çalıştırılacaksa limit ve onay durumunu önceden prova et.
4. Güvenlik testleri veya kanıt panelinden kayıtlı replay tablosunu aç. 125x, %90 bakiye ve transfer alanı senaryolarını göster (30 sn).
5. Mevcut niyet kaydının explorer bağlantısını veya audit doğrulamasını göster (20 sn). Ardından slayt 7'ye dön.

Ağ sorunu olursa data/attack-replay.json içindeki kayıtlı sonucu göster ve bunun canlı koşu olmadığını söyle. Bu sunum için yeni emir veya zincir işlemi çalıştırılmadı. Durdurma anahtarını canlı göstermek istersen ayrı prova yap ve demoya 30–60 saniye ekle.

## Jüriden gelebilecek sorular

**Zarar etmeyi tamamen önlüyor musunuz?** Hayır. Amaç yetkisiz veya policy dışı çağrıları engellemek. Kurallara uygun işlemler de piyasa zararı yaratabilir.

**Neden ikinci bir LLM tek başına yeterli değil?** Karantina içerik etkisini azaltır. Nihai sınırlar şema, deterministik kurallar ve zincir kapısıyla uygulanır.

**Zincir niye gerekli?** Kullanıcı policy hash'ini ve durdurma durumunu zincirde yönetir. IntentGate emri göndermeden önce bu durumu kontrol eder. Audit kökü, kayıtların sonradan değişip değişmediğini denetlemeyi sağlar.

**3,615 saniye neyi ölçüyor?** Kayıtlı Fuji testinde pause gönderiminden IntentGate'in engellemesine kadar geçen süreyi. Tek ölçümdür ve genel ağ kesinleşme süresi ya da SLA değildir.

**Çok kullanıcılı yapı hazır mı?** Kullanıcı başına ayrı Guardian, veritabanı ve OKX demo anahtarı altyapısı var. Gerçek Supabase kullanıcısıyla uçtan uca deneme tamamlanmamış. Policy ve kill-switch ortak, kullanıcı audit'i yerel. Uzak MCP kapısı sahibin Guardian'ına bağlı.

**Ücret ne zaman sayılıyor?** Mevcut sayaç ALLOWED veya PENDING_APPROVAL alan önerileri korunan işlem sayıyor. Bu, gerçekleşmiş borsa emriyle aynı tanım değil. Faturalama öncesinde sözleşme netleştirilmeli.

**API anahtarı çalınırsa?** Guardian dışında erişim riski oluşur. Trade yetkisi, para çekmenin kapalı olması, IP kısıtı ve hesap izolasyonu ayrıca önem taşır.

## İçerik kaynakları

README.md; policy.json; src/policy/rules.ts; src/guardian.ts; src/tools.ts; contracts/src/IntentGate.sol; docs/ARCHITECTURE.md; docs/threat-model.md; docs/avalanche.md; docs/service.md; docs/tenants.md; docs/llm.md; data/attack-replay.json; data/killswitch-latency.json.

Eski pitch'teki tek kiracı ve zorunlu spot stop-loss gibi ifadeler güncel policy ve kişisel hesap dokümanlarıyla düzeltildi. Fiyatlar öneridir. Kayıtlı testler bu sunum hazırlanırken yeniden çalıştırılmadı.
