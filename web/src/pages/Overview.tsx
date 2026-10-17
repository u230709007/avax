import { useEffect, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { DecisionsTable } from "../components/DecisionsTable";
import { Card, Empty, Metric, Mono } from "../components/ui";
import { fmtDateTime, fmtUsd } from "../format";
import type { State } from "../store";

export function Overview({ state, goDecisions }: { state: State; goDecisions: () => void }) {
  const p = state.portfolio;
  const s = p?.snapshot;
  const lastAnchor = state.anchors.find((a) => a.txHash);
  const [bills, setBills] = useState<{ ts: number; bal: number }[]>();
  const [billsErr, setBillsErr] = useState<string>();

  useEffect(() => {
    api<{ ts: number; bal: number }[]>("/api/bills?ccy=USDT").then(setBills).catch((e: Error) => setBillsErr(e.message));
  }, [s?.ts]);

  return (
    <div className="flex flex-col gap-6">
      {state.portfolioError && !s && (
        <div className="rounded-md border border-line bg-[var(--bad-bg)] px-4 py-3 text-sm text-[var(--bad-fg)]">
          OKX verisi alınamadı ({state.portfolioError}). ATK bağlantısını ve demo API anahtarını kontrol edin.
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Toplam değer" value={s ? `${fmtUsd(s.totalEqUsd)} $` : "—"} hint="OKX demo hesabı, canlı" />
        <Metric
          label="Bugün PnL"
          value={s ? <span className={s.dailyPnlPct >= 0 ? "text-[var(--ok-fg)]" : "text-[var(--bad-fg)]"}>{`${s.dailyPnlPct >= 0 ? "+" : ""}${fmtUsd(s.dailyPnlPct)}%`}</span> : "—"}
          hint={s ? `Gün başı ${fmtUsd(s.dayStartEqUsd)} $` : undefined}
        />
        <Metric
          label="24s limit kullanımı"
          value={p ? `${fmtUsd(p.volume24h)} / ${fmtUsd(p.limit24h, 0)}` : "—"}
          hint={p ? <LimitBar used={p.volume24h} max={p.limit24h} /> : undefined}
        />
        <Metric label="Son anchor" value={lastAnchor ? `#${lastAnchor.toSeq}` : "—"} hint={lastAnchor ? fmtDateTime(lastAnchor.ts) : "Henüz zincire yazılmadı"} />
      </div>

      <Card title="USDT bakiye geçmişi" action={<span className="text-xs text-muted">Kaynak: OKX account bills</span>}>
        <div className="h-56 px-2 py-3">
          {bills && bills.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bills} margin={{ left: 8, right: 8, top: 8 }}>
                <XAxis dataKey="ts" tickFormatter={(t: number) => new Date(t).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" })} tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} minTickGap={40} />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={64} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}
                  labelFormatter={(t) => new Date(Number(t)).toLocaleString("tr-TR")}
                  formatter={(v) => [`${fmtUsd(Number(v))} USDT`, "Bakiye"]}
                />
                <Area type="monotone" dataKey="bal" stroke="var(--chart)" strokeWidth={1.5} fill="var(--chart)" fillOpacity={0.08} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <Empty>{billsErr ? `Bakiye geçmişi alınamadı (${billsErr})` : bills ? "Grafik için yeterli hareket yok" : "Yükleniyor"}</Empty>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card title="Varlıklar" className="xl:col-span-1">
          {s?.holdings.length ? (
            <table className="w-full text-sm">
              <tbody>
                {s.holdings.map((h) => (
                  <tr key={h.ccy} className="border-b border-line last:border-0">
                    <td className="px-4 py-2 font-medium">{h.ccy}</td>
                    <td className="num px-4 py-2 text-right">{fmtUsd(h.eq, h.ccy === "USDT" ? 2 : 4)}</td>
                    <td className="num px-4 py-2 text-right text-muted">{fmtUsd(h.eqUsd)} $</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>Varlık yok</Empty>
          )}
          {s && s.positions.length > 0 && (
            <div className="border-t border-line px-4 py-3">
              <div className="label mb-2">Açık pozisyonlar</div>
              {s.positions.map((pos) => (
                <div key={pos.posId} className="flex justify-between py-1 text-sm">
                  <Mono>{pos.instId}</Mono>
                  <span className="num">{pos.lever}x</span>
                  <span className={`num ${Number(pos.upl) >= 0 ? "text-[var(--ok-fg)]" : "text-[var(--bad-fg)]"}`}>{fmtUsd(Number(pos.upl))} USDT</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Son kararlar" className="xl:col-span-2" action={<button className="text-xs text-accent" onClick={goDecisions}>Tümünü gör</button>}>
          <DecisionsTable rows={state.decisions.slice(0, 8)} anchors={state.anchors} explorer={state.status?.chain.explorer} filter={(r) => r.tool !== "startup"} />
        </Card>
      </div>
    </div>
  );
}

function LimitBar({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, (used / max) * 100);
  return (
    <span className="mt-1 block h-1.5 w-full overflow-hidden rounded bg-[var(--idle-bg)]">
      <span className="block h-full rounded" style={{ width: `${pct}%`, background: pct > 80 ? "var(--bad-fg)" : "var(--accent)" }} />
    </span>
  );
}
