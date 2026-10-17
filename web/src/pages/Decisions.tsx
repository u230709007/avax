import { useState } from "react";
import { DecisionsTable } from "../components/DecisionsTable";
import { Card } from "../components/ui";
import type { State } from "../store";

const FILTERS = [
  { id: "all", label: "Tümü", fn: () => true },
  { id: "trade", label: "İşlemler", fn: (o: string, t: string) => ["propose_trade", "approve", "close_position", "cancel_order"].includes(t) },
  { id: "rejected", label: "Retler", fn: (o: string) => o === "REJECTED" },
  { id: "warning", label: "Uyarılar", fn: (o: string) => o === "WARNING" },
  { id: "agent", label: "Ajan notları", fn: (_o: string, t: string) => t === "agent_note" },
] as const;

export function Decisions({ state, readOnly = false }: { state: State; readOnly?: boolean }) {
  const [f, setF] = useState<(typeof FILTERS)[number]["id"]>("all");
  const filter = FILTERS.find((x) => x.id === f)!;
  return (
    <Card
      title={`Guardian kararları (${state.decisions.length})`}
      action={
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((x) => (
            <button key={x.id} onClick={() => setF(x.id)} className={`rounded px-2 py-1 text-xs ${f === x.id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`}>
              {x.label}
            </button>
          ))}
        </div>
      }
    >
      <DecisionsTable readOnly={readOnly} rows={state.decisions} anchors={state.anchors} explorer={state.status?.chain.explorer} filter={(r) => filter.fn(r.outcome, r.tool)} />
    </Card>
  );
}

