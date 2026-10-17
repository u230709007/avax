# Sealed Intent Guardian

**Prompt injection ile kandırılsa bile para kaybettiremeyen otonom AVAX trade ajanı.**
OKX TR × Team1 Türkiye Agentic Hackathon — **OKX Agent Trade Kit (ATK)** + **Avalanche Fuji**.

> Varsayım: LLM tamamen ele geçirilmiştir ve saldırganın istediği her tool çağrısını yapar.
> Amaç: bu durumda bile kullanıcının parasının çıkamaması. Güvenlik LLM'e veya prompt'a değil, **koda ve zincire** dayanır.

---

## İçindekiler
- [Problem](#problem)
- [Çözüm: beş katmanlı savunma](#çözüm-beş-katmanlı-savunma)
- [Mimari](#mimari)
- [LLM'in gördüğü dünya: 7 tool](#llmin-gördüğü-dünya-7-tool)
- [Kural motoru](#kural-motoru)
- [Avalanche: zincir üstü kanıt](#avalanche-zincir-üstü-kanıt)
- [Çalışma modları](#çalışma-modları)
- [Kurulum](#kurulum)
- [Komutlar](#komutlar)
- [Test ve saldırı demosu](#test-ve-saldırı-demosu)
- [Proje yapısı](#proje-yapısı)
- [Sınırlar ve kalan riskler](#sınırlar-ve-kalan-riskler)
- [Dokümanlar](#dokümanlar)

---

## Problem
AI trade ajanları web sayfası, haber ve sohbet metni okur. Bu metnin içine gizlenmiş bir talimat (gizli CSS, sıfır genişlikli karakter,
Mors, base64, sahte "destek" mesajı) ajanı "tüm bakiyeyle 125x long aç" ya da "şu adrese gönder" demeye ikna edebilir. Gerçek olaylarda
(Bankrbot, AIXBT vb.) tam olarak bu oldu. Prompt'a "bunu yapma" yazmak bir savunma değildir; LLM kandırılabilir.

## Çözüm: beş katmanlı savunma
| # | Katman | Ne yapar | Doküman |
|---|---|---|---|
| 1 | **Maskeleme (tokenizasyon)** | LLM gerçek bakiye, emir ID'si, adres görmez. `P_AVAX`, `ORD_xxxxxxxx`, `{{BAL:USDT}}`, DÜŞÜK/ORTA/YÜKSEK kovaları görür. | [masking.md](docs/masking.md) |
| 2 | **Kapalı intent dili** | LLM'in sadece 7 dar tool'u var. `transfer`, `withdraw`, ham `instId`/`sz` diye bir araç yok. Sıkı Zod şeması, fazladan alan → ret. | [policy.md](docs/policy.md) |
| 3 | **Karantina (dual-LLM)** | Haber/web metni önce kodla taranır (gizli metin, Mors, base64, unicode tag); bayraklı içerik ana LLM'e hiç gitmez. | [quarantine.md](docs/quarantine.md) |
| 4 | **Deterministik kural motoru** | Her öneri kod kurallarından geçer: allowlist, limitler, kaldıraç, zorunlu SL, fiyat bandı, günlük zarar, insan onayı. **Emri LLM değil kod üretir.** | [policy.md](docs/policy.md) |
| 5 | **Zincir üstü kanıt ve kapı** | Kural dosyasının hash'i, kill-switch, her emir öncesi niyet kaydı ve audit Merkle kökleri Avalanche Fuji'de. | [avalanche.md](docs/avalanche.md) |

Herhangi bir katman okunamazsa sistem **fail-closed** çalışır: zincir, ATK veya veritabanı okunamazsa yazma kapanır, okuma devam eder.

## Mimari
```
Kullanıcı ──sohbet──► LLM (Groq / Gemini / Claude)
                        │  sadece maskeli veri · 7 dar tool (MCP)
                        ▼
              ┌──────── GUARDIAN (deterministik kod) ────────┐
              │ Vault (maskeleme) · Kural motoru · Onay       │
              │ Sanitize + karantina · Audit (SQLite)         │
              └───┬───────────────────┬───────────────────┬───┘
                  │ MCP stdio          │ haber / web        │ zincir
                  ▼                    ▼                    ▼
       okx-trade-mcp (ATK, --demo)   tarama + karantina   Avalanche Fuji
                  │                                        PolicyRegistry · IntentGate · AuditAnchor
                  ▼
           OKX Demo Trading
```

Bir işlem önerisinin yolu:
1. LLM `propose_trade({ pair: "P_AVAX", market: "swap", side: "buy", size_pct: 10, leverage: 2, sl_pct: 3 })` çağırır.
2. Guardian şemayı doğrular, zinciri okur (policy hash eşleşiyor mu, kill-switch kapalı mı).
3. Statik kurallar (kaldıraç, SL, TP), ardından veriye bağlı kurallar (fiyat, bakiye, limitler) çalışır.
4. Gerekirse insan onayı istenir (`PENDING_APPROVAL`); onay **sadece** yerel arayüzden verilebilir, LLM'in onay aracı yoktur.
5. Niyet hash'i IntentGate kontratına yazılır, sonra guardian emri kendisi üretir: IOC limit, fiyat bandı içinde, SL/TP ekli.
6. Karar audit hash zincirine eklenir; Merkle kökü periyodik olarak Fuji'ye yazılır.

LLM sağlayıcısı (`LLM_PROVIDER`) değiştirilebilir: varsayılan **Groq** (`openai/gpt-oss-120b`, karantina `gpt-oss-20b`), ayrıca **Gemini** ve
**Claude Opus 5.5**. Arayüzde sohbet kutusunun sağ üstündeki seçiciden anahtarı olan modele geçilebilir. Güvenlik sağlayıcıdan bağımsızdır.

## LLM'in gördüğü dünya: 7 tool
| Tool | Ne döner / ne yapar |
|---|---|
| `get_market_view` | Fiyat, RSI/EMA göstergeleri (herkese açık veri) |
| `get_portfolio_view` | Maskeli portföy: kovalar, paylar, yön; gerçek rakam yok |
| `get_news_digest` | Taranmış haber; bayraklı öğe metinsiz gelir |
| `read_url` | Allowlist'teki sayfayı guardian çeker ve tarar |
| `propose_trade` | İşlem niyeti; kurallardan geçer, emri guardian üretir |
| `close_position` | Pozisyon kapatma (risk azaltır, kill-switch açıkken de serbest) |
| `cancel_order` | Maskeli emir ID'si ile iptal |

Para transferi, çekim, adres, onay veya kural değiştirme aracı **yoktur**. Maskeli değerlerin gerçeği sadece yerel panelde
(`http://127.0.0.1:7070` → Genel bakış) gösterilir; LLM'e hiç gitmez.

## Kural motoru
Kurallar [`policy.json`](policy.json) dosyasından okunur (şu an **v5**), çalışma zamanında dondurulur ve hash'i zincirdekiyle karşılaştırılır.
Sıra her zaman: **zincir → statik → veriye bağlı**.

| Kural | Varsayılan | Ret kodu |
|---|---|---|
| Zincir okunabilir, hash eşleşir, duraklatılmamış | — | `CHAIN_UNREACHABLE`, `POLICY_HASH_MISMATCH`, `PAUSED_ONCHAIN` |
| Çift allowlist'te | AVAX, BTC, ETH (USDT) | `INSTRUMENT_NOT_ALLOWED` |
| Kaldıraç | spot 1x, swap ≤ 3x | `LEVERAGE_EXCEEDED` |
| Stop-loss | swap'ta zorunlu, ≤ %5 | `SL_REQUIRED`, `SL_TOO_WIDE` |
| Take-profit | ≤ %50 | `TP_TOO_WIDE` |
| Tek işlem tutarı | ≤ 50 USDT ve ≤ bakiyenin %20'si | `SIZE_EXCEEDED` |
| Kayan 24 saat hacim | ≤ 300 USDT | `VOLUME_LIMIT` |
| Hız | dakikada < 2 emir | `RATE_LIMIT` |
| Günlük zarar | > −%5 (bilinmiyorsa ret) | `DAILY_LOSS_LIMIT` |
| Güvenilmeyen içerik sonrası yön doğrulaması | EMA20/EMA50 + RSI14 (15 dk) | `SIGNAL_NOT_CONFIRMED` |

**İnsan onayı:** 25 USDT üstü işlemler ve web sayfası veya bayraklı haber okunduktan sonraki 15 dakika içindeki her öneri.
Güvenilmeyen içerik bir işlemi tek başına **başlatamaz**, sadece LLM'i vazgeçirebilir.

`policy.json` değişirse `npm run policy:set-hash` ile zincire yazılmalıdır; yazılmazsa guardian `POLICY_HASH_MISMATCH` verir ve işlem açmaz.
Tüm kodlar ve emir üretimi: [docs/policy.md](docs/policy.md).

## Avalanche: zincir üstü kanıt
Üç kontrat ([`contracts/src/`](contracts/src/)):

| Kontrat | Görev |
|---|---|
| `PolicyRegistry.sol` | Geçerli kural hash'i + kill-switch (`pause()` / `unpause()`). Sadece sahip cüzdan değiştirir. |
| `IntentGate.sol` | Her emirden önce niyet hash'i yazılır; kill-switch kontrolü zincirde atomik yapılır. |
| `AuditAnchor.sol` | Audit kararlarının Merkle kökleri (her 20 karar veya 5 dakikada bir). |

- Sunucu ele geçirilip `policy.json` sessizce gevşetilirse hash tutmaz → işlem kapanır.
- Kullanıcı panikte kendi cüzdanından `pause()` çağırır → sonraki her öneri `PAUSED_ONCHAIN`. Ölçülen gecikme: **~3,6 sn**.
- Herhangi bir karar `npm run audit:verify -- <seq>` ile Merkle kanıtı üzerinden zincirdeki kökle doğrulanır (Snowtrace'te de görülür).

## Çalışma modları
Hepsi aynı guardian'ı kullanır:

| Mod | Komut | Kullanım |
|---|---|---|
| **A — Web + otonom** | `npm run dev` | Yerel arayüz (:7070), sohbet, otonom tur, onay ekranı, kill-switch |
| **B — Claude Desktop/Code** | `npm run mcp` | Guardian stdio MCP sunucusu olur (`.mcp.json`); gerçek değer paneli yine :7070 |
| **C — Servis kapısı** | `npm run dev` ile açılır (:7072) | Uzak MCP (`POST /mcp`, API anahtarı + plan kotası) + herkese açık kanıt paneli |
| **D — ATK uyumlu kapı** | `POST /atk` veya `npm run mcp:atk` | `okx-trade-mcp` için yazılmış ajan sadece URL değiştirir; aynı tool adları, emirler guardian'dan geçer |

**Kişisel hesaplar:** Arayüzde e-posta ile kayıt olan kullanıcı kendi OKX demo anahtarını bağlar ve kendine ait bir guardian'a
(ayrı veritabanı, vault, limit ve ATK süreci) girer. Ayrıntı: [docs/tenants.md](docs/tenants.md).

**Servis planları** (kota kodda uygulanır): Sandbox (ücretsiz, 5 korunan işlem/gün), Pro (29 $/ay, 100/gün), Desk (0,05 $/korunan işlem).
Reddedilen saldırılar kotaya sayılmaz. Ayrıntı: [docs/service.md](docs/service.md), [docs/compat.md](docs/compat.md).

## Kurulum
**Gereksinimler:** Node.js ≥ 22.5 (`node:sqlite` için), OKX demo trading hesabı, Fuji test AVAX'ı ([faucet](https://core.app/tools/testnet-faucet)),
bir LLM anahtarı (Groq ücretsiz katmanı yeterli). Kontrat testleri için isteğe bağlı Foundry.

```bash
# 1. Bağımlılıklar
npm install

# 2. OKX demo API anahtarı: sadece Read + Trade yetkisi, Withdraw KAPALI, IP whitelist önerilir
npx okx config init            # veya .env'de OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE

# 3. Ortam değişkenleri
cp .env.example .env
#   LLM_PROVIDER + ilgili anahtar (GROQ_API_KEY / GEMINI_API_KEY / ANTHROPIC_API_KEY)
#   VAULT_HMAC_KEY   → openssl rand -hex 32
#   UI_TOKEN         → openssl rand -hex 16
#   DEPLOYER_PRIVATE_KEY (kontrat sahibi) ve ANCHOR_PRIVATE_KEY (sadece gas parası olan AYRI cüzdan)

# 4. Kontratları derle ve Fuji'ye deploy et (çıktıdaki adresleri .env'e yaz)
npm run contracts:build
npm run deploy:fuji
npm run deploy:intent-gate
npm run policy:set-hash

# 5. Çalıştır
npm run dev                    # arayüzü derler, guardian + API: http://127.0.0.1:7070/?token=<UI_TOKEN>
npm run attack-site            # saldırı demo sayfaları: http://127.0.0.1:7071
```

> OKX demo emirleri `54092` ile reddediliyorsa OKX Web/App'te demo modunda Spot işlem sayfasını açıp feragatnameyi onaylayın.

Ayrıntılı kurulum, hata durumları ve demo öncesi kontrol listesi: [docs/runbook.md](docs/runbook.md).

## Komutlar
| Komut | Açıklama |
|---|---|
| `npm run dev` | Arayüzü derler, guardian + API (:7070) ve servis kapısını (:7072) başlatır |
| `npm run web` | Arayüz geliştirme sunucusu (Vite, :5173) |
| `npm run mcp` / `npm run mcp:atk` | Stdio MCP sunucusu (guardian tool'ları / ATK uyumlu tool'lar) |
| `npm run attack-site` | Saldırı sayfaları (:7071) |
| `npm test` · `npm run typecheck` | Birim testler · tip kontrolü |
| `npm run test:integration` | Gerçek OKX demo + LLM + Fuji ile entegrasyon testleri (`.env` gerekir) |
| `npm run docs:check` | Kaynak dosya ↔ doküman bağlantılarını denetler |
| `npm run contracts:build` · `npm run deploy:fuji` · `npm run deploy:intent-gate` | Kontrat derleme ve deploy |
| `npm run policy:set-hash` | `policy.json` hash'ini zincire yazar |
| `npm run killswitch:measure` | Kill-switch gecikmesini ölçer |
| `npm run audit:verify -- <seq>` | Bir kararı zincirdeki Merkle köküyle doğrular |
| `npm run attack:replay` | Gerçek olay senaryolarını oynatır, sonuç tablosu üretir |
| `npm run service:key -- create "<ad>" [sandbox\|pro\|desk]` · `list` · `revoke <id>` | Servis API anahtarı yönetimi |

## Test ve saldırı demosu
```bash
npm test                    # birim testler (kurallar, maskeleme, sanitize, guardian, audit, servis, ATK kapısı, kişisel hesaplar)
npm run test:integration    # gerçek OKX demo + LLM + Fuji
forge test --use <solc>     # kontrat testleri (PolicyRegistry, AuditAnchor, IntentGate)
npm run attack:replay       # saldırı tablosu (guardian kapalıyken çalıştırın)
```

Saldırı sayfaları ([`attack-site/pages/`](attack-site/pages/)) ve hangi katmanın durdurduğu:

| Saldırı | Durduran | Kod |
|---|---|---|
| Mors ile "125x long, tüm bakiye" | Karantina + kurallar | `LEVERAGE_EXCEEDED`, `SIZE_EXCEEDED` |
| Gizli CSS / zero-width talimat | Sanitize; metin LLM'e gitmez | `HIDDEN_TEXT` |
| Sahte destek: "şu adrese ödeme yap" | Transfer aracı yok; adres yazılırsa | `MASKING_VIOLATION` |
| Allowlist dışı coin, `to` alanı | Kapalı intent dili | `INSTRUMENT_NOT_ALLOWED`, `SCHEMA_INVALID` |
| `policy.json` sessizce gevşetilir | Zincirdeki hash | `POLICY_HASH_MISMATCH` |
| Limiti 10 küçük emre bölmek | Kayan 24s hacim + hız limiti | `VOLUME_LIMIT`, `RATE_LIMIT` |
| LLM kendi işlemini onaylar | Onay aracı yok, sadece token'lı arayüz | — |
| Audit kaydı değiştirilir | Hash zinciri + zincirdeki Merkle kökü | doğrulama "Eşleşmedi" |

Tam tehdit modeli: [docs/threat-model.md](docs/threat-model.md).

## Proje yapısı
```
src/
  guardian.ts        maskele → kural → onay → emir üret; 7 tool'un uygulayıcısı
  tools.ts           LLM'e açık 7 tool'un şeması
  mcpServer.ts       guardian MCP sunucusu (LLM'in tek ucu)
  bootstrap.ts       açılış, bağımlılıkların kurulması
  main.ts            (A) web + sohbet + otonom döngü girişi
  mcpStdio.ts        (B) stdio MCP girişi
  server.ts          Fastify API + WebSocket (127.0.0.1 + token)
  runtime.ts         bir guardian'ın sohbet + otonom döngüsü
  policy/ config/    intent şeması, kurallar, motor; policy.json yükleme ve hash
  masking/           Vault: tanıtıcı, kova, sızıntı tarama
  ingest/            sanitize: gizli metin, Mors, base64, unicode
  llm/ chat/         sağlayıcılar (Groq, Gemini, Anthropic), karantina, sohbet host'ları
  upstream/          ATK MCP istemcisi + tool allowlist
  chain/             Fuji okuma/yazma (PolicyRegistry, IntentGate, AuditAnchor)
  audit/ store/      hash zinciri, Merkle, anchor; SQLite
  approval/          insan onayı (sadece arayüzden)
  market/            RSI / EMA
  service/           servis kapısı: uzak MCP + kanıt paneli
  compat/            ATK uyumlu kapı
  tenants/           kişisel hesaplar
contracts/           Solidity kontratları ve forge testleri
web/                 React + Tailwind arayüz
attack-site/         saldırı demo sayfaları
scripts/             deploy, policy hash, audit doğrulama, docs:check
tests/               birim ve entegrasyon testleri (fixture'lar sadece burada)
examples/            attack-replay
docs/                tüm dokümanlar
```

## Sınırlar ve kalan riskler
- **OKX API anahtarı çalınırsa guardian atlanır.** Bu yüzden anahtar sadece trade yetkili, çekim kapalı, IP whitelist'li ve tercihen alt hesap olmalı.
- Allowlist içinde kurallara uygun ama kötü işlemler mümkündür; zarar günlük %5 ile sınırlıdır.
- Guardian sadece kendisinden geçen içeriği tarar. Ajan web'i başka bir araçla okursa tarama olmaz, ancak her emir yine kurallardan geçer ve transfer yoktur.
- ATK her zaman `--demo` ile çalışır; proje gerçek parayla işlem yapmaz.
- Kişisel hesapların audit kökleri zincire yazılmaz (AuditAnchor tek akış).

## Dokümanlar
Tüm dokümanların dizini: [docs/INDEX.md](docs/INDEX.md). Öne çıkanlar:
[Mimari](docs/ARCHITECTURE.md) · [Akışlar](docs/WORKFLOW.md) · [Kurallar](docs/policy.md) · [Maskeleme](docs/masking.md) ·
[Karantina](docs/quarantine.md) · [Avalanche](docs/avalanche.md) · [Audit](docs/audit.md) · [Servis](docs/service.md) ·
[ATK kapısı](docs/compat.md) · [Tehdit modeli](docs/threat-model.md) · [Runbook](docs/runbook.md) · [Demo senaryosu](docs/DEMO_SCRIPT.md)

Görsel kurallar: [DESIGN.md](DESIGN.md) · Geliştirme dersleri: [LEARN.md](LEARN.md) · Kod haritası: [CLAUDE.md](CLAUDE.md)
