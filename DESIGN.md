# DESIGN.md — Arayüz tasarım sistemi

Referans: kullanıcının verdiği **BuildProof** ekranı (koyu zemin, ızgara çizgileri, aralıklı mono etiketler, büyük kalın başlıklar).
Kullanıcı isteğiyle (2026-10-17) **siyah-beyaz**: turuncu yok, vurgu rengi beyaz. Hedef his: teknik, koyu, "kanıt" odaklı panel.
Token'ların tek kaynağı `web/src/styles.css` (`:root`, tek tema: koyu). Bu dosya ile birebir tutulur.

## Yasaklar
- Emoji yok. Durumlar metin rozetiyle veya ikon + renkli noktayla gösterilir.
- Renk gradient'i, glow, glassmorphism, neon, mor-mavi geçişler yok. (Izgara çizgileri `linear-gradient` ile çizilir; renk geçişi değildir.)
- Tek istisna (kullanıcı isteği): arka plan ızgarasında fare çevresindeki çizgiler beyaz aydınlanır (`.grid-bg::after`, 240px dairesel maske). Sadece çizgiler; kart ve yazıya ışık yok.
- Dekoratif animasyon yok; sadece hover/odak renk ve opaklık geçişi.
- Mock / yer tutucu sayı yok. Veri yoksa boş durum metni ("Henüz karar yok") veya "—".
- Avatar yok; konuşmacı etiketi metin ("Sen", "Ajan").

## Renkler
| Token | Değer | Kullanım |
|---|---|---|
| `--bg` | #0A0A0A | sayfa zemini, kenar ray, üst bar |
| `--surface` | #0F0F0F | kart |
| `--surface-muted` | #171717 | ipucu balonu, hover |
| `--border` | #262626 | tüm 1px çizgiler |
| `--grid` / `--grid-lit` | beyaz %4,5 / %28 | arka plan ızgarası (64px) / fare çevresinde aydınlanan çizgi |
| `--text` / `--text-muted` / `--text-faint` | #F5F5F5 / #8F8F8F / #5C5C5C | metin |
| `--accent` | #FFFFFF | tek vurgu (beyaz): logo, aktif menü, birincil buton, link, grafik |
| `--accent-soft` / `--accent-line` | beyaz %8 / %35 | aktif menü zemini / çerçevesi |
| `--ok` / `--bad` / `--warn` / `--idle` | yeşil / kırmızı / açık gri / gri (%10 zemin + açık metin) | İzin, Ret/hata/kill-switch, Uyarı, Okuma |

Kural: turuncu/amber hiç yok. Renk sadece durum anlamı taşır (yeşil izin, kırmızı ret/kill-switch); o da sadece rozet, nokta ve sayıda.

## Tipografi
- UI ve başlıklar: DM Sans 400–700. Kod, ID, hash, etiket: JetBrains Mono 400–600.
- `.label`: mono, 11px, büyük harf, harf aralığı 0.18em, gri. Menü ipuçları, kart başlıkları, metrik etiketleri, tablo başlıkları.
- `.display`: 700, harf aralığı -0.035em. Sayfa başlığı 40px (Genel bakış 60px), mobilde 30–36px.
- Sayfa başı: `NN · SAYFA` mono üst etiketi + büyük başlık + 16–18px gri alt metin.
- Metrik değer 30px/600. Tüm rakamlar `tabular-nums` (`.num`). Para biçimi `tr-TR`: `1.243,50`; yüzde `+1,20%`.

## Yerleşim
- Tüm uygulama ekranın ortasında **en fazla 1440px'lik çerçeve** (`md:border-x`); dışında ve arkasında ızgara görünür.
- Masaüstü: çerçevenin solunda yapışkan **ikon rayı** 72px (logo + 5 ikon, 44px kare). Üstüne gelince/odaklanınca sağda adı balonla çıkar;
  aktif olan beyaz çerçeve + zemin alır ve adı sayfa başlığında yazar.
- Üst bar 64px, yapışkan: solda "Sealed Intent **Guardian**", sağda **model seçici** (Groq varsayılan; Gemini/Claude anahtarı yoksa pasif; mobilde sadece ikon) ve **durum ikonları** (36px kare, köşede renkli nokta,
  üstüne gelince "OKX demo · Bağlı" gibi balon): OKX, Fuji policy, kill-switch durumu, canlı akış; varsa "Zincirden durdur" ikon butonu (kırmızı).
- İçerik en fazla 1320px, ortalı, `px-8`. Kartlar arası 24px.
- Mobil (<768px): ray alt sekme çubuğu olur (sadece ikon; aktifin altında adı yazar); tablolar kart listesine döner; 16px kenar; yatay kaydırma yok.
- Kart: `--surface`, 1px `--border`, 12px köşe, gölge yok. Başlık şeridi alt çizgili, başlık `.label`.
- Tablo: başlık satırı `.label`, satır 1px alt çizgi, hover `--surface-muted`, `table-fixed` + uzun hücrelerde `truncate`.
- Detay: sağdan açılan çekmece (max 576px), arka plan %60 karartma.
- Hata şeridi: açık gri çerçeveli kutu, sağda kapatma (X).

## Bileşenler
- `Badge`: mono 10px büyük harf, 1px tonlu çerçeve, %10 tonlu zemin.
- `Button`: 36px; primary (beyaz dolgu, siyah metin), secondary (çerçeveli), danger (kırmızı metin, hover kırmızı zemin).
- `Tip`: ipucu balonu (mono 11px büyük harf), `side="right"` (ray) veya `"bottom"` (üst bar).
- `Metric`: etiket + değer + ipucu satırı; ilerleme çubuğu 6px, %80 üstü kırmızı.
- İkonlar: Lucide, 16–18px, 1.75 çizgi, tek renk.
- Grafik: tek seri alan grafiği, beyaz 1.5px çizgi, %8 dolgu, eksen çizgisi yok, 11px eksen yazısı.

## Ekranlar
Genel bakış · Sohbet · Kararlar · Audit · Ayarlar. Ayrıntılar ve veri kaynakları: `docs/ui.md`.

## Kontrol
Her arayüz değişikliğinden sonra: 1440px ve 390px ekran görüntüsü; `scrollWidth > innerWidth` olmamalı (LEARN L-007).

## Tanıtım sayfası istisnası
2026-10-17 kullanıcı talebi: giriş öncesi sayfada verilen videolar arka plan/özellik kartı medyası olarak kullanılır. `landing.css` yalnızca tanıtım ve giriş penceresini biçimlendirir. Siyah-beyaz görünüm, büyük başlıklar, iki sütunlu kartlar ve etkileşimli süreç çizgisi kullanılır. Video duraklatılabilir ve reduced-motion tercihini izler. Okunabilirlik için videonun üzerinde siyah saydamlık geçişi kullanılabilir. Giriş sonrası panel tasarımı korunur.
