import { useEffect, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, Mono } from "../components/ui";
import type { State } from "../store";

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
  useEffect(() => setAuto(state.status?.autonomous?.enabled ?? false), [state.status?.autonomous?.enabled]);
  const chain = state.status?.chain;

  const toggleAuto = async () => {
    const r = await api<{ enabled: boolean }>("/api/settings/autonomous", { method: "POST", body: { enabled: !auto } });
    setAuto(r.enabled);
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
        </Card>
      )}
      <Card title="Avalanche durumu">
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 px-4 py-4 text-sm">
          <dt className="text-muted">PolicyRegistry</dt>
          <dd><Mono>{chain?.policyRegistry ?? "tanımlı değil"}</Mono></dd>
          <dt className="text-muted">AuditAnchor</dt>
          <dd><Mono>{chain?.auditAnchor ?? "tanımlı değil"}</Mono></dd>
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
      </Card>
      <Card title="Politika (salt okunur)">
        <pre className="overflow-auto px-4 py-4 font-mono text-xs leading-relaxed">{p ? JSON.stringify(p.policy, null, 2) : "Yükleniyor"}</pre>
      </Card>
    </div>
  );
}
