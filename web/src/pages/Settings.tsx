import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, Mono } from "../components/ui";
import type { State } from "../store";
import { unlinkOkx } from "../Accounts";

interface PolicyResp {
  policy: Record<string, unknown>;
  localHash: string;
}

export function Settings({ state }: { state: State }) {
  const [p, setP] = useState<PolicyResp>();
  const [auto, setAuto] = useState(state.status?.autonomous?.enabled ?? false);
  useEffect(() => {
    api<PolicyResp>("/api/policy").then(setP).catch(() => undefined);
  }, []);
  useEffect(() => {
    setAuto(state.status?.autonomous?.enabled ?? false);
  }, [state.status?.autonomous?.enabled]);
  const chain = state.status?.chain;

  const toggleAuto = async () => {
    const r = await api<{ enabled: boolean }>("/api/settings/autonomous", { method: "POST", body: { enabled: !auto } });
    setAuto(r.enabled);
  };

  const [tick, setTick] = useState<{ busy: boolean; text?: string; error?: string }>({ busy: false });
  const runTick = async () => {
    setTick({ busy: true });
    try {
      const r = await api<{ display: string }>("/api/autonomous/tick", { method: "POST", body: {} });
      setTick({ busy: false, text: r.display });
    } catch (e) {
      setTick({ busy: false, error: (e as Error).message === "busy" ? "Ajan şu an meşgul" : (e as Error).message });
    }
  };

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
      {state.status?.autonomous && (
        <Card title="Otonom mod">
          <div className="flex items-center justify-between gap-4 px-4 py-4">
            <p className="text-sm text-muted">
              Açıkken ajan her {Math.round(state.status.autonomous.intervalSeconds / 60)} dakikada bir piyasayı, portföyü ve haberleri değerlendirir.
              Sohbetle aynı tool'ları ve aynı kuralları kullanır; ek yetkisi yoktur.
            </p>
            <Button variant={auto ? "danger" : "primary"} onClick={toggleAuto}>{auto ? "Durdur" : "Başlat"}</Button>
          </div>
          <div className="flex flex-col gap-3 border-t border-line px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">Zamanlayıcıyı beklemeden tek tur: ajan kendi planlar, limit içindeki işlem onaysız yürür.</p>
              <Button onClick={runTick} disabled={tick.busy}>{tick.busy ? "Tur sürüyor…" : "Şimdi bir tur çalıştır"}</Button>
            </div>
            {tick.text && <p className="whitespace-pre-wrap rounded-lg border border-line bg-bg px-3 py-2 text-sm">{tick.text}</p>}
            {tick.error && <p className="text-xs text-[var(--bad-fg)]">{tick.error}</p>}
          </div>
        </Card>
      )}
      <Card title="Avalanche durumu">
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 px-4 py-4 text-sm">
          <dt className="text-muted">PolicyRegistry</dt>
          <dd><Mono>{chain?.policyRegistry ?? "tanımlı değil"}</Mono></dd>
          <dt className="text-muted">AuditAnchor</dt>
          <dd><Mono>{chain?.auditAnchor ?? "tanımlı değil"}</Mono></dd>
          <dt className="text-muted">IntentGate</dt>
          <dd><Mono>{chain?.intentGate ?? "tanımlı değil"}</Mono></dd>
          <dt className="text-muted">Yerel policy hash</dt>
          <dd><Mono className="break-all">{p?.localHash ?? chain?.localHash}</Mono></dd>
          <dt className="text-muted">Zincirdeki hash</dt>
          <dd><Mono className="break-all">{chain?.onchainHash ?? "—"}</Mono></dd>
          <dt className="text-muted">Eşleşme</dt>
          <dd>{chain?.policyHashMatches ? <Badge tone="ok">Eşleşti</Badge> : <Badge tone="bad">Eşleşmiyor</Badge>}</dd>
          <dt className="text-muted">Kill-switch</dt>
          <dd>{chain?.paused ? <Badge tone="bad">Durduruldu</Badge> : <Badge tone="ok">Aktif</Badge>}</dd>
          {chain?.error && (
            <>
              <dt className="text-muted">Hata</dt>
              <dd className="text-xs text-[var(--bad-fg)]">{chain.error}</dd>
            </>
          )}
        </dl>
      </Card>
      <Card title="OKX Agent Trade Kit">
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 px-4 py-4 text-sm">
          <dt className="text-muted">Bağlantı</dt>
          <dd>{state.status?.okx.connected ? <Badge tone="ok">Bağlı · demo</Badge> : <Badge tone="bad">Bağlı değil</Badge>}</dd>
          {state.status?.okx.error && (
            <>
              <dt className="text-muted">Hata</dt>
              <dd className="text-xs text-[var(--bad-fg)]">{state.status.okx.error}</dd>
            </>
          )}
          {state.status?.okx.missingTools.length ? (
            <>
              <dt className="text-muted">Eksik tool</dt>
              <dd><Mono>{state.status.okx.missingTools.join(", ")}</Mono></dd>
            </>
          ) : null}
          <dt className="text-muted">LLM'e açık tool'lar</dt>
          <dd><Mono>{state.status?.tools.join(", ")}</Mono></dd>
        </dl>
        {state.status?.role === "account" && <UnlinkOkx />}
      </Card>
      <Card title="Politika (salt okunur)">
        <pre className="overflow-auto px-4 py-4 font-mono text-xs leading-relaxed">{p ? JSON.stringify(p.policy, null, 2) : "Yükleniyor"}</pre>
      </Card>
    </div>
  );
}

/** Kişisel hesap: kayıtlı OKX anahtarını sunucudan siler ve kişisel Guardian'ı kapatır. Karar kayıtları silinmez. */
function UnlinkOkx() {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const run = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      await unlinkOkx();
      location.reload();
    } catch {
      setErr("Bağlantı kaldırılamadı. Tekrar dene.");
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-4 text-sm">
      <span className="mr-auto text-muted">{confirm ? "OKX API anahtarın sunucudan silinecek. Emin misin?" : "OKX API anahtarın bu hesaba bağlı."}</span>
      {err && <span className="text-xs text-[var(--bad-fg)]">{err}</span>}
      {confirm ? (
        <>
          <Button onClick={() => setConfirm(false)} disabled={busy}>Vazgeç</Button>
          <Button variant="danger" onClick={() => void run()} disabled={busy}>{busy ? "Kaldırılıyor" : "Bağlantıyı kaldır"}</Button>
        </>
      ) : (
        <Button onClick={() => setConfirm(true)}>OKX bağlantısını kaldır</Button>
      )}
    </div>
  );
}
