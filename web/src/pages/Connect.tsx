import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { Badge, Button, Card, Empty, Mono } from "../components/ui";
import { fmtDateTime } from "../format";

interface Plan {
  label: string;
  priceUsdMonth: number;
  callsPerDay: number;
  tradesPerDay: number;
  perTradeUsd: number;
}

interface KeyRow {
  id: string;
  name: string;
  plan: string;
  created: number;
  revoked: boolean;
  usage24h: { calls: number; trades: number };
}

interface ServiceResp {
  enabled: boolean;
  mcpUrl: string | null;
  publicUrl: string | null;
  tools: string[];
  plans: Record<string, Plan>;
  keys: KeyRow[];
}

function Copy({ text, children }: { text: string; children: ReactNode }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 pr-20 font-mono text-xs leading-relaxed text-ink">{children}</pre>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          });
        }}
        className="absolute right-2 top-2 rounded border border-line bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted hover:text-ink"
      >
        {done ? "Kopyalandı" : "Kopyala"}
      </button>
    </div>
  );
}

const planPrice = (p: Plan) => (p.perTradeUsd ? `$${p.perTradeUsd} / işlem` : p.priceUsdMonth ? `$${p.priceUsdMonth} / ay` : "Ücretsiz");

/** Ajanların (Claude Code, kendi botu, OKX.AI) guardian'a uzak MCP ile bağlanması: adres, anahtarlar, kullanım. */
export function Connect() {
  const [s, setS] = useState<ServiceResp>();
  const [err, setErr] = useState<string>();
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("pro");
  const [created, setCreated] = useState<{ id: string; key: string; name: string }>();

  const load = () =>
    api<ServiceResp>("/api/service")
      .then((r) => {
        setS(r);
        setErr(undefined);
      })
      .catch((e: Error) => setErr(e.message));

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 15_000);
    return () => {
      window.clearInterval(t);
    };
  }, []);

  const create = async () => {
    try {
      const r = await api<{ id: string; key: string }>("/api/service/keys", { method: "POST", body: { name: name.trim(), plan } });
      setCreated({ ...r, name: name.trim() });
      setName("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const revoke = async (id: string) => {
    await api(`/api/service/keys/${id}/revoke`, { method: "POST", body: {} });
    if (created?.id === id) setCreated(undefined);
    await load();
  };

  const url = s?.mcpUrl ?? "http://127.0.0.1:7072/mcp";
  const key = created?.key ?? "sig_...";
  const label = (created?.name || "guardian-http").replace(/[^a-zA-Z0-9_-]/g, "-");
  const cli = `claude mcp add --transport http ${label} ${url} --header "Authorization: Bearer ${key}"`;
  const json = `{
  "mcpServers": {
    "${label}": {
      "type": "http",
      "url": "${url}",
      "headers": { "Authorization": "Bearer ${key}" }
    }
  }
}`;
  const isLocal = /\/\/(127\.0\.0\.1|localhost)[:/]/.test(url);

  return (
    <div className="flex flex-col gap-6">
      {err && <div className="rounded-xl border border-line bg-surface px-5 py-3 text-sm text-muted">Hata: {err}</div>}

      <Card
        title="Bağlantı adresi"
        action={s ? <Badge tone={s.enabled ? "ok" : "bad"}>{s.enabled ? "Servis kapısı açık" : "Servis kapısı kapalı"}</Badge> : undefined}
      >
        {!s ? (
          <Empty>Yükleniyor…</Empty>
        ) : !s.enabled ? (
          <Empty>Servis kapısı kapalı. .env içinde PUBLIC_PORT=7072 yapıp npm run dev'i yeniden başlatın.</Empty>
        ) : (
          <div className="flex flex-col gap-4 p-5 text-sm">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
              <span className="label self-center">MCP adresi</span>
              <Mono className="break-all text-ink">{url}</Mono>
              <span className="label self-center">Kanıt paneli</span>
              <a className="break-all text-accent underline" href={s.publicUrl ?? "#"} target="_blank" rel="noreferrer">
                <Mono>{s.publicUrl}</Mono>
              </a>
              <span className="label self-center">Tool'lar</span>
              <div className="flex flex-wrap gap-2">
                {s.tools.map((t) => (
                  <Badge key={t} tone="idle">{t}</Badge>
                ))}
              </div>
            </div>
            <p className="text-muted">
              Ajan OKX'e değil bu adrese bağlanır; sadece maskeli veriyi görür ve 7 dar tool kullanır. Gerçek tutarlar ve onay bekleyen işlemler
              yalnızca bu arayüzde görünür.
              {isLocal && " Adres sadece bu bilgisayardan erişilebilir; bulut LLM'leri ve OKX.AI için tünel açıp PUBLIC_URL'i ayarlayın."}
            </p>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Card title="1 · Ajan anahtarı oluştur">
          <form
            className="flex flex-col gap-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="label">Ajan adı</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="örn. claude-code"
                className="h-10 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent-line"
              />
            </label>
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="label">Plan</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {s &&
                  Object.entries(s.plans).map(([id, p]) => (
                    <button
                      type="button"
                      key={id}
                      onClick={() => setPlan(id)}
                      aria-pressed={plan === id}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors ${plan === id ? "border-accent-line bg-accent-soft" : "border-line hover:border-faint"}`}
                    >
                      <div className="label">{p.label}</div>
                      <div className="num mt-1 font-semibold">{planPrice(p)}</div>
                      <div className="mt-1 text-xs text-muted">{p.tradesPerDay.toLocaleString("tr-TR")} işlem / gün</div>
                    </button>
                  ))}
              </div>
            </div>
            <div>
              <Button type="submit" variant="primary" disabled={!name.trim() || !s?.enabled}>Anahtar oluştur</Button>
            </div>
            {created && (
              <div className="flex flex-col gap-2 rounded-lg border border-accent-line bg-accent-soft p-3">
                <span className="text-sm">
                  <span className="font-semibold">{created.name}</span> için anahtar. Sadece şimdi gösteriliyor; sayfadan çıkınca tekrar görülemez.
                </span>
                <Copy text={created.key}>{created.key}</Copy>
              </div>
            )}
          </form>
        </Card>

        <Card title="2 · Ajanına ekle">
          <div className="flex flex-col gap-4 p-5 text-sm">
            <div className="flex flex-col gap-2">
              <span className="label">Claude Code (terminal)</span>
              <Copy text={cli}>{cli}</Copy>
            </div>
            <div className="flex flex-col gap-2">
              <span className="label">Claude Desktop / Cursor / diğer MCP istemcileri</span>
              <Copy text={json}>{json}</Copy>
            </div>
            <p className="text-muted">
              Ekledikten sonra istemciyi yeniden açın; Claude Code'da <Mono>/mcp</Mono> listesinde 7 tool görünür. Sonra ajana doğal dille yazın:
              "AVAX piyasasına bak, uygunsa küçük bir alım öner".
              {!created && " Komutlarda sig_... yerine oluşturduğunuz anahtarı yazın."}
            </p>
          </div>
        </Card>
      </div>

      <Card title="Bağlı ajanlar (son 24 saat)">
        {!s || s.keys.length === 0 ? (
          <Empty>Henüz anahtar yok.</Empty>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="label px-4 py-2 font-medium">Ajan</th>
                <th className="label hidden w-24 px-4 py-2 font-medium sm:table-cell">Plan</th>
                <th className="label w-24 px-4 py-2 font-medium">Çağrı</th>
                <th className="label w-24 px-4 py-2 font-medium">İşlem</th>
                <th className="label hidden w-36 px-4 py-2 font-medium md:table-cell">Oluşturma</th>
                <th className="label w-28 px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {s.keys.map((k) => {
                const p = s.plans[k.plan];
                return (
                  <tr key={k.id} className="border-b border-line last:border-0 hover:bg-surface-muted">
                    <td className="truncate px-4 py-2">
                      <div className="truncate">{k.name}</div>
                      <Mono className="text-muted">{k.id}</Mono>
                    </td>
                    <td className="hidden px-4 py-2 sm:table-cell">{p?.label ?? k.plan}</td>
                    <td className="num px-4 py-2">
                      {k.usage24h.calls}
                      {p && <span className="text-muted"> / {p.callsPerDay.toLocaleString("tr-TR")}</span>}
                    </td>
                    <td className="num px-4 py-2">
                      {k.usage24h.trades}
                      {p && <span className="text-muted"> / {p.tradesPerDay.toLocaleString("tr-TR")}</span>}
                    </td>
                    <td className="num hidden truncate px-4 py-2 text-muted md:table-cell">{fmtDateTime(k.created)}</td>
                    <td className="px-4 py-2 text-right">
                      {k.revoked ? <Badge tone="idle">İptal</Badge> : <Button variant="danger" onClick={() => void revoke(k.id)}>İptal et</Button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
