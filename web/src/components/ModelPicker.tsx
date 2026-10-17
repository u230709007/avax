// docs: docs/ui.md
import { useState } from "react";
import { Cpu } from "lucide-react";
import type { State } from "../store";
import { api } from "../api";
import { Tip } from "./ui";

/** Sohbet kutusunun sağ üstündeki model seçici: Groq varsayılan; anahtarı olan Gemini/Claude seçilebilir. Kurallar hangisinde olursa olsun aynıdır. */
export function ModelPicker({ state, onError }: { state: State; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const llm = state.status?.llm ?? [];
  const active = llm.find((p) => p.active)?.id ?? "";
  const change = async (provider: string) => {
    setBusy(true);
    try {
      await api("/api/settings/llm", { method: "POST", body: { provider } });
    } catch (e) {
      onError(`Model değiştirilemedi: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tip text={state.status?.agent ? `Ajan · ${state.status.agent}` : "Ajan modeli"}>
      <span className="relative flex h-8 w-[112px] shrink-0 items-center rounded-lg border border-line text-muted hover:text-ink focus-within:border-accent-line">
        <Cpu size={14} strokeWidth={1.75} className="pointer-events-none absolute left-2.5" />
        <select
          aria-label="Ajan modeli"
          value={active}
          disabled={busy || state.agentBusy}
          onChange={(e) => void change(e.target.value)}
          className="h-full w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent pl-7 pr-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink outline-none disabled:cursor-wait disabled:opacity-60"
        >
          {llm.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.available} className="bg-surface text-ink">
              {p.label}
              {p.available ? "" : " · anahtar yok"}
            </option>
          ))}
        </select>
      </span>
    </Tip>
  );
}
