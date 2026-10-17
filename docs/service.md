# Servis — uzak MCP + kanıt paneli (iş modeli)

## Amaç
Guardian'ı tek kişilik demodan **satılabilir bir servise** çevirmek: herhangi bir AI trade ajanı (Claude, kendi botu, OKX.AI'daki bir ajan)
OKX'e doğrudan değil, bu MCP servisine bağlanır. Ürün = "her trade ajanının önüne takılan güvenlik katmanı".
Aynı kapıdan herkese açık, salt okunur bir kanıt paneli verilir (jüri/müşteri kendisi doğrular).

## Dosyalar
`src/service/gateway.ts` (Fastify kapısı), `src/service/keys.ts` (API anahtarı, plan, kota, kullanım), `src/mcpServer.ts` (`ToolMeter` kancası),
`scripts/service-key.ts`, `web/public.html`, `web/src/public.tsx`, `src/store/db.ts` (`api_keys`, `usage`, `intents` tabloları).

## Akış
```
Ajan (herhangi bir MCP istemcisi) ── POST /mcp, Authorization: Bearer sig_… ──► servis kapısı (PUBLIC_PORT, vars. 7072)
   anahtar sha256 ile çözülür → plan kotası (before) → guardian MCP Server (7 tool, istek başına yeni örnek) → kullanım kaydı (after)
Herkes ── GET / , /public/api/{summary,decisions,verify/:seq} , /mcp/info ──► salt okunur kanıt
```
- `POST /atk`: aynı anahtar ve kota ile **ATK uyumlu kapı** (okx-trade-mcp tool adları/şemaları; emir tool'ları da "korunan işlem" sayılır). Bkz. `docs/compat.md`.
- Transport: MCP Streamable HTTP, durumsuz (`sessionIdGenerator: undefined`, JSON yanıt). `GET/DELETE /mcp` → 405.
- `/mcp/info`: katalog kartı (ad, açıklama, tool'lar, planlar, Fuji kontrat adresleri). OKX.AI listelemesinde bu bilgiler kullanılır.
- Panel: saldırı tablosu (`data/attack-replay.json`), kill-switch ölçümü (`data/killswitch-latency.json`), Fuji kontratları,
  emir öncesi zincir kayıtları (IntentGate), son kararlar + "Zincirde doğrula", anchor'lar, bağlanma talimatı ve planlar.

**Planlar** (`PLANS`, kota kodda uygulanır; faturalama dışarıda):
| Plan | Fiyat | Çağrı/gün | Korunan işlem/gün |
|---|---|---|---|
| Sandbox | ücretsiz | 200 | 5 |
| Pro | 29 $/ay (ajan başına) | 5.000 | 100 |
| Desk | 0,05 $/korunan işlem | 50.000 | 2.000 |
"Korunan işlem" = guardian'ın kurallardan geçirip `ALLOWED` veya `PENDING_APPROVAL` verdiği `propose_trade`. Reddedilen saldırı kotaya sayılmaz.

**Hedef kullanıcı:** (1) AI ajanıyla trade eden bireysel kullanıcı ("ajanım kandırılırsa param gider" korkusu),
(2) trade ajanı geliştiricileri ve OKX.AI'da ajan yayınlayanlar (güvenliği kendileri yazmadan "kanıtlı" etiketi),
(3) ajanlara kısıtlı yetki vermek isteyen masalar (policy hash + kill-switch sahibin cüzdanında).

Anahtar yönetimi: yerel arayüzde **MCP** sayfası (oluştur, kopyala, iptal et, kullanım; işlemler audit'e `service_key` olarak yazılır) veya terminal:
```bash
npm run service:key -- create "benim-ajanim" pro   # anahtar bir kez yazdırılır
npm run service:key -- list                          # kullanım (24s çağrı / işlem)
npm run service:key -- revoke ak_xxxxxxxx
```
İstemci ayarı (Claude Code / Desktop `.mcp.json`): `{"type":"http","url":"https://<alan>/mcp","headers":{"Authorization":"Bearer sig_…"}}`.

## Kurallar / sınırlar
- Bir guardian örneği = bir OKX hesabı (tek kiracı). Birden çok ajan aynı hesabı farklı anahtar/planla kullanabilir. Çok kiracılı barındırma (kiracı başına
  ayrı guardian + ayrı OKX anahtarı) yol haritasında.
- **Gerçek değerler sadece yerel panelde:** uzak istemci (Claude Code vb.) `{{BAL:…}}`/`{{POS:…}}`/`{{PNL}}` etiketlerini dolduramaz, çünkü ekrandaki metin
  LLM'in metnidir. `/mcp` ve stdio modunda MCP `instructions` ajana etiketi rakam gibi sunmamasını, kova/oran anlatmasını ve gerçek rakamlar için
  kullanıcıyı yerel panele (`OWNER_PANEL_URL`, vars. `http://127.0.0.1:GUARDIAN_PORT` → Genel bakış) yönlendirmesini söyler. Değerler LLM'e hiç gitmez.
- Onay ve kill-switch bu kapıda YOK: sadece yerel token'lı arayüzde (`server.ts`, 127.0.0.1) ve sahibin cüzdanında.
- Panel API'si girdi/detay vermez (emir parametreleri, LLM metni, bakiye yok); sadece seq, zaman, tool, sonuç, kod, hash.
- Varsayılan `PUBLIC_HOST=127.0.0.1`. Dışa açmak bilinçli adımdır: tünel (örn. `cloudflared tunnel --url http://127.0.0.1:7072`) veya `PUBLIC_HOST=0.0.0.0`.
- Audit hash zinciri anahtar kimliği içermez (format değişmesin diye); anahtar bazlı kullanım `usage` tablosundadır.

## Nasıl test edilir
`tests/unit/service.test.ts` (anahtar çözme/iptal, işlem kotası, MCP üzerinden sayaç ve kota aşımında guardian'ın hiç çalışmaması).
Canlı: `npm run dev` → `curl http://127.0.0.1:7072/mcp/info`; anahtarla `initialize` → `tools/list` → `tools/call get_market_view` (2026-10-17 doğrulandı).

## Son güncelleme
2026-10-17 · `/atk` ATK uyumlu kapı, `/mcp/info` → `atkCompatible`. Öncesi: ilk sürüm: uzak MCP servisi, planlar/kota, herkese açık kanıt paneli.
