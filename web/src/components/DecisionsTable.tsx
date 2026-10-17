import { useState } from "react";
import { api } from "../api";
import { fmtTime, short, TOOL_LABELS } from "../format";
import type { Anchor, AuditRow } from "../types";
import { Button, Drawer, Empty, Json, Mono, OutcomeBadge } from "./ui";

function paramsSummary(r: AuditRow): string {
  const i = r.input as Record<string, unknown> | null;
  if (!i || typeof i !== "object") return "—";
  if ("redacted" in i) return "girdi gizlendi (maskeleme ihlali)";
  if (r.tool === "propose_trade" || r.tool === "approve") {
    const parts = [i.pair, i.market, i.side, i.size_pct !== undefined ? `%${i.size_pct}` : undefined, i.leverage && i.leverage !== 1 ? `${i.leverage}x` : undefined, i.sl_pct ? `SL %${i.sl_pct}` : undefined];
    return parts.filter(Boolean).join(" · ") || (i.approval_id as string) || "—";
  }
  if (r.tool === "read_url") return String(i.url ?? i.host ?? "—");
  if (r.tool === "agent_note") return String((r.detail as { text?: string } | null)?.text ?? "").slice(0, 90);
  const vals = Object.values(i).filter((v) => typeof v === "string" || typeof v === "number");
  return vals.length ? vals.join(" · ") : "—";
}

export function DecisionsTable({ rows, anchors, filter, explorer }: { rows: AuditRow[]; anchors: Anchor[]; filter?: (r: AuditRow) => boolean; explorer?: string }) {
  const [open, setOpen] = useState<AuditRow>();
  const list = filter ? rows.filter(filter) : rows;
  if (!list.length) return <Empty>Henüz karar yok.</Empty>;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-24" />
            <col className="w-20" />
            <col className="w-36" />
            <col />
            <col className="w-28" />
            <col className="w-48" />
            <col className="w-24" />
          </colgroup>
          <thead>
            <tr className="border-b border-line text-left">
              {["Zaman", "Kaynak", "Tool", "Parametre (maskeli)", "Sonuç", "Kod", "Seq"].map((h) => (
                <th key={h} className="label px-4 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.seq} onClick={() => setOpen(r)} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-muted">
                <td className="num px-4 py-2 text-muted">{fmtTime(r.ts)}</td>
                <td className="px-4 py-2 text-muted">{r.source === "llm" ? "Ajan" : r.source === "human" ? "Kullanıcı" : "Sistem"}</td>
                <td className="truncate px-4 py-2">{TOOL_LABELS[r.tool] ?? r.tool}</td>
                <td className="truncate px-4 py-2 text-muted" title={paramsSummary(r)}>{paramsSummary(r)}</td>
                <td className="px-4 py-2">
                  <OutcomeBadge outcome={r.outcome} />
                </td>
                <td className="truncate px-4 py-2" title={r.code ?? ""}>
                  <Mono>{r.code ?? "—"}</Mono>
                </td>
                <td className="num px-4 py-2 text-muted">
                  {r.seq}
                  {anchors.some((a) => a.fromSeq <= r.seq && r.seq <= a.toSeq && a.txHash) && <span className="ml-1 text-xs text-[var(--ok-fg)]">zincirde</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {list.map((r) => (
          <li key={r.seq} onClick={() => setOpen(r)} className="flex flex-col gap-1 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">{TOOL_LABELS[r.tool] ?? r.tool}</span>
              <OutcomeBadge outcome={r.outcome} />
            </div>
            <div className="break-all text-xs text-muted">{paramsSummary(r)}</div>
            <div className="flex justify-between gap-3 text-xs text-faint">
              <span className="num shrink-0">{fmtTime(r.ts)}</span>
              <Mono className="break-all text-right">{r.code ?? ""}</Mono>
            </div>
          </li>
        ))}
      </ul>
      <DecisionDrawer row={open} onClose={() => setOpen(undefined)} explorer={explorer} />
    </>
  );
}

function DecisionDrawer({ row, onClose, explorer }: { row?: AuditRow; onClose: () => void; explorer?: string }) {
  const [verify, setVerify] = useState<{ verified: boolean; onchainRoot: string; txHash: string; chainIntact: boolean } | { error: string }>();
  const [loading, setLoading] = useState(false);
  if (!row) return null;
  const rules = (Array.isArray(row.detail) ? row.detail : (row.detail as { rules?: unknown } | null)?.rules) as
    | { rule: string; ok: boolean; detail?: string }[]
    | undefined;
  const items = (row.detail as { items?: unknown[] } | null)?.items;
  const decoded = (row.detail as { decoded?: { kind: string; text: string }[] } | null)?.decoded;

  const doVerify = async () => {
    setLoading(true);
    try {
      setVerify(await api(`/api/verify/${row.seq}`));
    } catch (e) {
      setVerify({ error: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer open onClose={() => { setVerify(undefined); onClose(); }} title={`Karar #${row.seq} · ${TOOL_LABELS[row.tool] ?? row.tool}`}>
      <div className="flex flex-col gap-5 text-sm">
        <div className="flex items-center gap-2">
          <OutcomeBadge outcome={row.outcome} />
          <Mono>{row.code ?? ""}</Mono>
          <span className="ml-auto text-xs text-muted">{new Date(row.ts).toLocaleString("tr-TR")}</span>
        </div>
        <div>
          <div className="label mb-2">Tool girdisi (maskeli)</div>
          <Json value={row.input} />
        </div>
        {rules && (
          <div>
            <div className="label mb-2">Kurallar</div>
            <ul className="divide-y divide-line rounded-md border border-line">
              {rules.map((r) => (
                <li key={r.rule} className="flex items-center justify-between gap-3 px-3 py-2">
                  <Mono>{r.rule}</Mono>
                  <span className="truncate text-xs text-muted">{r.detail}</span>
                  <span className={`text-xs font-medium ${r.ok ? "text-[var(--ok-fg)]" : "text-[var(--bad-fg)]"}`}>{r.ok ? "Geçti" : "Kaldı"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {items && (
          <div>
            <div className="label mb-2">Karantina özeti (LLM'in gördüğü)</div>
            <Json value={items} />
          </div>
        )}
        {decoded && decoded.length > 0 && (
          <div>
            <div className="label mb-2">Çözülen gizli içerik (sadece burada, hiçbir LLM'e gitmez)</div>
            <ul className="flex flex-col gap-2">
              {decoded.map((d, i) => (
                <li key={i} className="rounded-md border border-line bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn-fg)]">
                  <Mono>{d.kind}</Mono> {d.text}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="label mb-2">Bütünlük</div>
          <dl className="grid grid-cols-[7rem_1fr] gap-y-1 text-xs">
            <dt className="text-muted">Önceki hash</dt>
            <dd><Mono>{short(row.prevHash, 10)}</Mono></dd>
            <dt className="text-muted">Kayıt hash</dt>
            <dd><Mono>{short(row.hash, 10)}</Mono></dd>
          </dl>
          <div className="mt-3 flex items-center gap-3">
            <Button onClick={doVerify} disabled={loading}>{loading ? "Doğrulanıyor" : "Zincirde doğrula"}</Button>
            {verify && "error" in verify && <span className="text-xs text-muted">{verify.error === "not_anchored_yet" ? "Henüz zincire yazılmadı" : verify.error}</span>}
            {verify && "verified" in verify && (
              <span className={`text-xs font-medium ${verify.verified ? "text-[var(--ok-fg)]" : "text-[var(--bad-fg)]"}`}>
                {verify.verified ? "Doğrulandı: kayıt zincirdeki kökle eşleşiyor" : "Eşleşmedi"}
                {explorer && verify.txHash && (
                  <a className="ml-2 text-accent underline" href={`${explorer}/tx/${verify.txHash}`} target="_blank" rel="noreferrer">
                    Snowtrace
                  </a>
                )}
              </span>
            )}
          </div>
        </div>
        {row.detail != null && !rules && !items && (
          <div>
            <div className="label mb-2">Detay</div>
            <Json value={row.detail} />
          </div>
        )}
      </div>
    </Drawer>
  );
}
