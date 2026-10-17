import { SecurityTests } from "./pages/SecurityTests";
import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ShieldCheck } from "lucide-react";
import { GridBackground } from "./components/GridBackground";
import { Badge, Button, Card, Empty, Metric, Mono, OutcomeBadge } from "./components/ui";
import { fmtDateTime, short, TOOL_LABELS } from "./format";
import "./styles.css";

/** Herkese açık kanıt paneli (docs/service.md). Sadece /public/api okur; token, bakiye, emir parametresi yok. */

interface Plan {
  label: string;
  priceUsdMonth: number;
  callsPerDay: number;
  tradesPerDay: number;
  perTradeUsd: number;
}

interface Summary {
  chain: {
    network: string;
    reachable: boolean;
    policyHashMatches: boolean;
    paused: boolean;
    onchainVersion: number | null;
    onchainHash: string | null;
    localHash: string;
    policyVersion: number;
    contracts: { policyRegistry: string | null; auditAnchor: string | null; intentGate: string | null };
    explorer: string;
  };
  audit: { lastSeq: number; chainIntact: boolean; outcomes: { outcome: string; n: number }[]; rejects: { code: string; n: number }[] };
  anchors: { id: number; ts: number; fromSeq: number; toSeq: number; root: string; txHash: string | null }[];
  intents: { ts: number; intentHash: string; txHash: string; commitMs: number }[];
  intentFinalityMs: { median: number; min: number; max: number; n: number } | null;
  attackReplay: { ts: number; policyVersion: number; rows: Record<string, string>[] } | null;
  killSwitch: { ts: number; pauseFinalityMs?: number; gateBlockedAfterMs?: number; pauseTx?: string; unpauseFinalityMs?: number } | null;
  service: { endpoint: string; tools: string[]; plans: Record<string, Plan> };
}

interface Decision {
  seq: number;
  ts: number;
  source: string;
  tool: string;
  outcome: string;
  code: string | null;
  hash: string;
}

type Verify = { verified: boolean; chainIntact: boolean; onchainRoot: string; txHash: string | null } | { error: string };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !(data as { error?: string }).error) throw new Error(res.statusText);
  return data as T;
}

const ms = (n: number | undefined) => (n === undefined ? "—" : n >= 1000 ? `${(n / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} sn` : `${n} ms`);

function Section({ n, title, sub, children }: { n: string; title: string; sub: string; children?: ReactNode }) {
  return (
    <div>
      <div className="label">{n}</div>
      <h1 className="display mt-3 text-[30px] leading-tight sm:text-[44px]">{title}</h1>
      <p className="mt-3 max-w-2xl text-base text-muted sm:text-lg">{sub}</p>
      {children}
    </div>
  );
}

function TxLink({ explorer, hash, kind = "tx" }: { explorer: string; hash: string | null; kind?: "tx" | "address" }) {
  if (!hash) return <>—</>;
  return (
    <a className="text-accent underline" href={`${explorer}/${kind}/${hash}`} target="_blank" rel="noreferrer">
      <Mono>{short(hash, 8)}</Mono>
    </a>
  );
}

function Th({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <th className={`label px-4 py-2 text-left font-medium ${className}`}>{children}</th>;
}

function VerifyCell({ seq }: { seq: number }) {
  const [res, setRes] = useState<Verify>();
  const [busy, setBusy] = useState(false);
  if (res) {
    if ("error" in res) return <span className="text-xs text-muted">{res.error === "not_anchored_yet" ? "Henüz zincirde değil" : res.error}</span>;
    return <Badge tone={res.verified && res.chainIntact ? "ok" : "bad"}>{res.verified && res.chainIntact ? "Doğrulandı" : "Uyuşmuyor"}</Badge>;
  }
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setRes(await get<Verify>(`/public/api/verify/${seq}`).catch((e: Error) => ({ error: e.message })));
        setBusy(false);
      }}
      className="font-mono text-[11px] uppercase tracking-[0.14em] text-accent underline disabled:opacity-50"
    >
      {busy ? "Kontrol…" : "Zincirde doğrula"}
    </button>
  );
}

function PublicApp() {
  const [s, setS] = useState<Summary>();
  const [rows, setRows] = useState<Decision[]>([]);
  const [err, setErr] = useState<string>();

  useEffect(() => {
    const load = async () => {
      try {
        const [sum, dec] = await Promise.all([get<Summary>("/public/api/summary"), get<Decision[]>("/public/api/decisions?limit=30")]);
        setS(sum);
        setRows(dec);
        setErr(undefined);
      } catch (e) {
        setErr((e as Error).message);
      }
    };
    void load();
    const t = window.setInterval(() => void load(), 15_000);
    return () => {
      window.clearInterval(t);
    };
  }, []);

  const count = (o: string) => s?.audit.outcomes.find((x) => x.outcome === o)?.n ?? 0;
  const c = s?.chain;
  const endpoint = `${location.origin}${s?.service.endpoint ?? "/mcp"}`;

  return (
    <>
      <GridBackground />
      <div className="relative mx-auto min-h-screen w-full max-w-[1440px] md:border-x md:border-line">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-8">
          <ShieldCheck size={20} strokeWidth={1.75} className="text-accent" />
          <span className="truncate font-semibold">
            Sealed Intent <span className="text-accent">Guardian</span>
          </span>
          <span className="label hidden sm:inline">· Kanıt paneli</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {c && (
              <>
                <Badge tone={!c.reachable ? "bad" : c.policyHashMatches ? "ok" : "bad"}>
                  {!c.reachable ? "Fuji okunamadı" : c.policyHashMatches ? `Policy v${c.policyVersion} zincirde` : "Policy uyuşmuyor"}
                </Badge>
                <Badge tone={c.paused ? "bad" : "ok"}>{c.paused ? "Durduruldu" : "Aktif"}</Badge>
              </>
            )}
          </div>
        </header>

        <main className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
          <Section
            n="00 · KANIT"
            title="Guardian kararları. Kayıtlarıyla birlikte."
            sub="Yapay zekâ trade ajanı OKX'e doğrudan değil bu guardian'a bağlanır. Her karar kodla verilir, hash zincirine yazılır, her emir öncesi Avalanche'ta kesinleşir. Bu sayfa salt okunurdur; her şey gerçek koşulardan gelir."
          />

          {err && <div className="rounded-xl border border-line bg-surface px-5 py-3 text-sm text-muted">Veri alınamadı: {err}</div>}

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Guardian kararı" value={s ? s.audit.lastSeq.toLocaleString("tr-TR") : "—"} hint={s ? (s.audit.chainIntact ? "Hash zinciri sağlam" : "Hash zinciri BOZUK") : undefined} />
            <Metric label="Reddedilen istek" value={s ? count("REJECTED").toLocaleString("tr-TR") : "—"} hint={s?.audit.rejects[0] ? `En sık: ${s.audit.rejects[0].code}` : "Henüz ret yok"} />
            <Metric
              label="Emir öncesi kesinleşme"
              value={s?.intentFinalityMs ? ms(s.intentFinalityMs.median) : "—"}
              hint={s?.intentFinalityMs ? `Medyan, son ${s.intentFinalityMs.n} emir (${ms(s.intentFinalityMs.min)}–${ms(s.intentFinalityMs.max)})` : "Henüz zincire yazılmış emir yok"}
            />
            <Metric
              label="Kill-switch etkisi"
              value={s?.killSwitch?.gateBlockedAfterMs !== undefined ? ms(s.killSwitch.gateBlockedAfterMs) : s?.killSwitch?.pauseFinalityMs !== undefined ? ms(s.killSwitch.pauseFinalityMs) : "—"}
              hint={s?.killSwitch ? `Ölçüm: ${fmtDateTime(s.killSwitch.ts)} · durdurma → yeni emir reddi` : "Ölçüm yok: npm run killswitch:measure"}
            />
          </div>

          <SecurityTests />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="Avalanche Fuji kontratları">
              {!c ? (
                <Empty>Yükleniyor…</Empty>
              ) : (
                <dl className="divide-y divide-line text-sm">
                  {(
                    [
                      ["PolicyRegistry", c.contracts.policyRegistry, "Policy hash + kill-switch"],
                      ["IntentGate", c.contracts.intentGate, "Her emirden önce niyet hash'i"],
                      ["AuditAnchor", c.contracts.auditAnchor, "Karar kayıtlarının Merkle kökleri"],
                    ] as const
                  ).map(([name, addr, what]) => (
                    <div key={name} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                      <div>
                        <div className="font-medium">{name}</div>
                        <div className="text-xs text-muted">{what}</div>
                      </div>
                      {addr ? <TxLink explorer={c.explorer} hash={addr} kind="address" /> : <span className="text-xs text-muted">Kurulmadı</span>}
                    </div>
                  ))}
                  <div className="px-5 py-3">
                    <div className="label">Policy hash (yerel = zincir)</div>
                    <Mono className="mt-1 block break-all text-muted">{c.localHash}</Mono>
                  </div>
                </dl>
              )}
            </Card>

            <Card title="Emir öncesi zincir kayıtları">
              {!s || s.intents.length === 0 ? (
                <Empty>Henüz zincire yazılmış emir yok.</Empty>
              ) : (
                <table className="w-full table-fixed text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <Th className="w-32">Zaman</Th>
                      <Th className="hidden sm:table-cell">Niyet hash'i</Th>
                      <Th className="w-28">Süre</Th>
                      <Th className="w-36">İşlem</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.intents.map((i) => (
                      <tr key={i.txHash} className="border-b border-line last:border-0">
                        <td className="num truncate px-4 py-2 text-muted">{fmtDateTime(i.ts)}</td>
                        <td className="hidden truncate px-4 py-2 sm:table-cell"><Mono>{short(i.intentHash, 10)}</Mono></td>
                        <td className="num px-4 py-2">{ms(i.commitMs)}</td>
                        <td className="truncate px-4 py-2"><TxLink explorer={s.chain.explorer} hash={i.txHash} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>

          <Card title="Son kararlar (hash zinciri)">
            {rows.length === 0 ? (
              <Empty>Henüz karar yok.</Empty>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <Th className="w-16">#</Th>
                    <Th className="hidden w-32 md:table-cell">Zaman</Th>
                    <Th>Tool</Th>
                    <Th className="w-32">Sonuç</Th>
                    <Th className="hidden w-48 lg:table-cell">Kod</Th>
                    <Th className="hidden w-40 sm:table-cell">Doğrulama</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.seq} className="border-b border-line last:border-0 hover:bg-surface-muted">
                      <td className="num px-4 py-2 text-muted">{r.seq}</td>
                      <td className="num hidden truncate px-4 py-2 text-muted md:table-cell">{fmtDateTime(r.ts)}</td>
                      <td className="truncate px-4 py-2">{TOOL_LABELS[r.tool] ?? r.tool}</td>
                      <td className="px-4 py-2"><OutcomeBadge outcome={r.outcome} /></td>
                      <td className="hidden truncate px-4 py-2 lg:table-cell"><Mono className="text-muted">{r.code ?? "—"}</Mono></td>
                      <td className="hidden px-4 py-2 sm:table-cell"><VerifyCell seq={r.seq} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Kendi ajanınızı bağlayın (MCP servisi)">
            <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
              <div className="min-w-0 space-y-3 text-sm text-muted">
                <p>
                  Ajanınız OKX'e doğrudan bağlanmaz; bu guardian'ı uzak MCP sunucusu olarak ekler. Ajan sadece maskeli veriyi görür ve 7 dar tool kullanır. Transfer ve çekim tool'u yoktur, emri guardian üretir.
                </p>
                <pre className="overflow-x-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed text-ink">
{`{
  "mcpServers": {
    "guardian": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer sig_…" }
    }
  }
}`}
                </pre>
                <div className="flex flex-wrap gap-2">
                  {s?.service.tools.map((t) => <Badge key={t} tone="idle">{t}</Badge>)}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {s &&
                  Object.entries(s.service.plans).map(([id, p]) => (
                    <div key={id} className="rounded-lg border border-line px-4 py-3">
                      <div className="label">{p.label}</div>
                      <div className="num mt-2 text-xl font-semibold">
                        {p.perTradeUsd ? `$${p.perTradeUsd} / işlem` : p.priceUsdMonth ? `$${p.priceUsdMonth} / ay` : "Ücretsiz"}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {p.callsPerDay.toLocaleString("tr-TR")} çağrı · {p.tradesPerDay.toLocaleString("tr-TR")} korunan işlem / gün
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </Card>

          <Card title="Avalanche anchor kayıtları">
            {!s || s.anchors.length === 0 ? (
              <Empty>Henüz anchor yok.</Empty>
            ) : (
              <table className="w-full table-fixed text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <Th className="w-32">Zaman</Th>
                    <Th className="w-36">Aralık</Th>
                    <Th className="hidden sm:table-cell">Merkle kökü</Th>
                    <Th className="w-36">İşlem</Th>
                  </tr>
                </thead>
                <tbody>
                  {s.anchors.map((a) => (
                    <tr key={a.id} className="border-b border-line last:border-0">
                      <td className="num truncate px-4 py-2 text-muted">{fmtDateTime(a.ts)}</td>
                      <td className="num truncate px-4 py-2">#{a.fromSeq} – #{a.toSeq}</td>
                      <td className="hidden truncate px-4 py-2 sm:table-cell"><Mono>{short(a.root, 10)}</Mono></td>
                      <td className="truncate px-4 py-2"><TxLink explorer={s.chain.explorer} hash={a.txHash} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <footer className="pb-8 text-xs text-muted">
            OKX hesabı: demo (Agent Trade Kit, --demo). Zincir: {c?.network ?? "Avalanche Fuji"}. Bu sayfa bakiye, emir büyüklüğü veya LLM metni göstermez.
            <span className="ml-2 inline-block"><Button onClick={() => location.reload()}>Yenile</Button></span>
          </footer>
        </main>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PublicApp />
  </StrictMode>,
);
