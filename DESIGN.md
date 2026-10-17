# DESIGN.md — Arayüz tasarım sistemi

Referans: Refero'daki **Stripe Dashboard** ekranları (kullanıcı seçimi). Hedef his: sakin, yoğun, güven veren finans paneli.
Token'ların tek kaynağı `web/src/styles.css` (`:root` + koyu tema). Bu dosya ile birebir tutulur.

## Yasaklar
- Emoji yok. Durumlar metin rozetiyle gösterilir ("İzin", "Ret", "Uyarı", "Onay bekliyor").
- Gradient, glow, glassmorphism, neon, büyük renkli hero, parıltı ikonları, mor-mavi geçişler yok.
- Dekoratif animasyon yok; sadece hover renk geçişi.
- Mock / yer tutucu sayı yok. Veri yoksa boş durum metni ("Henüz karar yok") veya "—".
- Avatar yok; konuşmacı etiketi metin ("Sen", "Ajan").

## Renkler
| Token | Açık | Koyu | Kullanım |
|---|---|---|---|
| `--bg` | #F6F8FA | #0E1116 | sayfa zemini |
| `--surface` | #FFFFFF | #161B22 | kart, kenar menü, üst bar |
| `--surface-muted` | #F9FAFB | #1B2129 | hover, kod blokları |
| `--border` | #E3E8EE | #2A313C | tüm 1px çizgiler |
| `--text` | #1A1F36 | #E6EDF3 | birincil metin |
| `--text-muted` | #697386 | #9AA5B1 | ikincil metin, etiket |
| `--accent` | #4F46E5 | #818CF8 | tek vurgu: aktif menü, birincil buton, link, grafik |
| `--ok-bg/fg` | #E6F4EA / #137333 | #0F2E1A / #6FDC8C | İzin |
| `--bad-bg/fg` | #FCE8E6 / #A50E0E | #3B1214 / #FF8A80 | Ret, hata, kill-switch |
| `--warn-bg/fg` | #FEF3C7 / #92400E | #3A2A0A / #F5C26B | Uyarı (karantina bayrağı) |
| `--idle-bg/fg` | #EDF0F3 / #4F566B | #232A33 / #B1BAC4 | Okuma, nötr |

Kural: bir ekranda vurgu rengi en fazla 2–3 yerde. Durum renkleri sadece rozet ve sayı renginde.

## Tipografi
- UI: Inter 400/500/600; kod, ID, hash, ret kodu: JetBrains Mono 400/500.
- Taban 14px. Kart başlığı 14px/600. Sayfa başlığı 16px/600.
- Metrik: 12px büyük harf gri etiket (`.label`, harf aralığı 0.04em) + 24px/600 değer.
- Tüm rakamlar `font-variant-numeric: tabular-nums` (`.num`). Para tutarları tablolarda sağa hizalı.
- Para biçimi `tr-TR`: `1.243,50`. Yüzde: `+1,20%`.

## Yerleşim
- Masaüstü: sol sabit kenar menü 224px + üst bar + içerik (`p-6`). Kartlar arası 24px.
- Mobil (<768px): kenar menü alt sekme çubuğu olur; tablolar kart listesine döner; 16px kenar boşluğu; yatay kaydırma yok.
- Kart: beyaz zemin, 1px `--border`, 8px köşe, gölge yok. Başlıklı kartta başlık şeridi alt çizgili.
- Tablo: başlık satırı `.label`, satır 1px alt çizgi, hover `--surface-muted`, `table-fixed` + uzun hücrelerde `truncate`.
- Detay: sağdan açılan çekmece (max 576px), arka plan %20 karartma.

## Bileşenler
- `Badge` tonları: ok, bad, warn, idle, accent. 12px/500, 4px köşe, iç boşluk 6×2px.
- `Button`: 32px yükseklik; primary (vurgu dolgu), secondary (çerçeveli), danger (kırmızı metin, hover kırmızı zemin).
- `Metric`: etiket + değer + ipucu satırı; ilerleme çubuğu 6px, %80 üstü kırmızı.
- İkonlar: Lucide, 16px, 1.75 çizgi, tek renk, sadece navigasyonda.
- Grafik: tek seri alan grafiği, 1.5px çizgi, %8 dolgu, eksen çizgisi yok, 11px eksen yazısı.

## Ekranlar
Genel bakış · Sohbet · Kararlar · Audit · Ayarlar. Ayrıntılar ve veri kaynakları: `docs/ui.md`.

## Kontrol
Her arayüz değişikliğinden sonra: açık + koyu tema ve 390px genişlikte ekran görüntüsü; `scrollWidth > innerWidth` olmamalı (LEARN L-007).
