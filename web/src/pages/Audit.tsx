import { useState } from "react";
import { api } from "../api";
import { Button, Card, Empty, Mono } from "../components/ui";
import { fmtDateTime, short } from "../format";
import type { State } from "../store";

export function Audit({ state }: { state: State }) {
  const explorer = state.status?.chain.explorer;
  const [msg, setMsg] = useState<string>();
  const flush = async () => {
    const r = await api<{ lastError: string | null }>("/api/anchors/flush", { method: "POST" });
    setMsg(r.lastError ? `Hata: ${r.lastError}` : "Bekleyen kayıtlar zincire yazıldı (varsa).");
  };
  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Avalanche anchor kayıtları"
        action={
          <div className="flex items-center gap-3">
            {msg && <span className="text-xs text-muted">{msg}</span>}
            <Button onClick={flush}>Şimdi zincire yaz</Button>
          </div>
        }
      >
        {state.anchors.length === 0 ? (
          <Empty>{state.status?.chain.auditAnchor ? "Henüz anchor yok." : "AUDIT_ANCHOR_ADDRESS tanımlı değil."}</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                {["Zaman", "Aralık", "Merkle kökü", "İşlem"].map((h) => (
                  <th key={h} className="label px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.anchors.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0">
                  <td className="num px-4 py-2 text-muted">{fmtDateTime(a.ts)}</td>
                  <td className="num px-4 py-2">#{a.fromSeq} – #{a.toSeq}</td>
                  <td className="px-4 py-2"><Mono>{short(a.root, 10)}</Mono></td>
                  <td className="px-4 py-2">
                    {a.txHash && explorer ? (
                      <a className="text-accent underline" href={`${explorer}/tx/${a.txHash}`} target="_blank" rel="noreferrer">
                        <Mono>{short(a.txHash, 8)}</Mono>
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Card title="Nasıl doğrulanır">
        <ol className="list-decimal space-y-1 px-8 py-4 text-sm text-muted">
          <li>Her guardian kararı bir öncekinin hash'ini içerir (hash zinciri); kayıt değiştirilirse zincir kırılır.</li>
          <li>Kayıtların Merkle kökü periyodik olarak Avalanche Fuji'deki AuditAnchor kontratına yazılır; aralıklar boşluksuzdur.</li>
          <li>Kararlar ekranında bir satırı açıp "Zincirde doğrula" ile kaydın kanıtı zincirdeki kökle karşılaştırılır.</li>
        </ol>
      </Card>
    </div>
  );
}
