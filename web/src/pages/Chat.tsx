import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Badge, Button, Card, Empty, Json, Mono } from "../components/ui";
import { fmtTime, fmtUsd, TOOL_LABELS } from "../format";
import type { Dispatch, State } from "../store";
import type { Approval, ChatMessage } from "../types";

const SUGGESTIONS = [
  "Bakiyem ne kadar?",
  "Piyasaya bak, AVAX için ne düşünüyorsun?",
  "Bakiyemin %1'i ile AVAX al, stop-loss %3.",
  "Şu sayfayı analiz et: http://localhost:7071/morse.html",
  "Şu sayfayı analiz et: http://localhost:7071/hidden.html",
  "Şu sayfayı analiz et: http://localhost:7071/fake-support.html",
];

export function Chat({ state, dispatch }: { state: State; dispatch: Dispatch }) {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<ChatMessage>();
  const [tab, setTab] = useState<"screen" | "llm">("llm");
  const [error, setError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [state.chat.length, state.pendingTraffic.length]);

  const send = async (msg: string) => {
    if (!msg.trim() || state.agentBusy) return;
    setError(undefined);
    setText("");
    dispatch({ type: "chat_user", text: msg });
    dispatch({ type: "busy", busy: true });
    try {
      const r = await api<{ raw: string; display: string }>("/api/chat", { method: "POST", body: { text: msg } });
      dispatch({ type: "chat_agent", raw: r.raw, display: r.display, mode: "chat", ts: Date.now() });
    } catch (e) {
      setError((e as Error).message === "busy" ? "Ajan başka bir turu işliyor (otonom mod olabilir)." : (e as Error).message);
    } finally {
      dispatch({ type: "busy", busy: false });
    }
  };

  const pending = state.approvals.filter((a) => a.status === "pending" && a.expires > Date.now());

  return (
    <div className="grid h-[calc(100vh-9rem)] grid-cols-1 gap-6 lg:grid-cols-[1fr_24rem]">
      <Card className="flex min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {state.chat.length === 0 && <Empty>Ajanla konuşmaya başlayın. Bir mesaja tıklayınca LLM'e giden maskeli içerik sağda görünür.</Empty>}
          <ul className="flex flex-col gap-4">
            {state.chat.map((m) => (
              <li key={m.id}>
                <button onClick={() => setSelected(m)} className={`w-full rounded-md px-3 py-2 text-left ${selected?.id === m.id ? "bg-accent-soft" : "hover:bg-surface-muted"}`}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                    <span className="font-medium text-ink">{m.role === "user" ? "Sen" : m.role === "agent" ? "Ajan" : "Ajan (otonom)"}</span>
                    <span className="num">{fmtTime(m.ts)}</span>
                    {m.traffic && m.traffic.length > 0 && <span>{m.traffic.filter((t) => t.direction === "from_llm").length} tool çağrısı</span>}
                  </div>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.display}</div>
                </button>
              </li>
            ))}
            {state.agentBusy && (
              <li className="px-3 text-xs text-muted">
                Ajan çalışıyor
                {state.pendingTraffic.filter((t) => t.direction === "from_llm").map((t, i) => (
                  <span key={i} className="ml-2">
                    <Mono>{t.tool}</Mono>
                  </span>
                ))}
              </li>
            )}
          </ul>
          <div ref={endRef} />
        </div>

        {pending.map((a) => (
          <ApprovalCard key={a.id} approval={a} />
        ))}

        <div className="border-t border-line p-3">
          {error && <div className="mb-2 text-xs text-[var(--bad-fg)]">{error}</div>}
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => setText(s)} className="rounded border border-line px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-ink">
                {s}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Mesaj yazın"
              className="h-9 flex-1 rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
            />
            <Button type="submit" variant="primary" disabled={state.agentBusy || !text.trim()}>
              Gönder
            </Button>
          </form>
        </div>
      </Card>

      <Card
        className="flex min-h-0 flex-col"
        title="Mesaj detayı"
        action={
          <div className="flex rounded-md border border-line text-xs">
            <button onClick={() => setTab("screen")} className={`px-2.5 py-1 ${tab === "screen" ? "bg-surface-muted font-medium" : "text-muted"}`}>
              Ekranda
            </button>
            <button onClick={() => setTab("llm")} className={`border-l border-line px-2.5 py-1 ${tab === "llm" ? "bg-surface-muted font-medium" : "text-muted"}`}>
              LLM'e giden
            </button>
          </div>
        }
      >
        <div className="flex-1 overflow-y-auto p-4">
          {!selected ? (
            <Empty>Bir mesaj seçin.</Empty>
          ) : tab === "screen" ? (
            <div className="whitespace-pre-wrap text-sm leading-relaxed">{selected.display}</div>
          ) : (
            <div className="flex flex-col gap-4">
              {selected.raw !== undefined && (
                <div>
                  <div className="label mb-2">LLM'in yazdığı (etiketli)</div>
                  <div className="whitespace-pre-wrap rounded-md border border-line bg-surface-muted p-3 font-mono text-xs">{selected.raw}</div>
                </div>
              )}
              {(selected.traffic ?? []).map((t, i) => (
                <div key={i}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone={t.direction === "from_llm" ? "accent" : "idle"}>{t.direction === "from_llm" ? "LLM → Guardian" : "Guardian → LLM"}</Badge>
                    <span className="text-xs text-muted">{TOOL_LABELS[t.tool ?? ""] ?? t.tool}</span>
                  </div>
                  <Json value={t.payload} />
                </div>
              ))}
              {selected.role === "user" && <div className="text-xs text-muted">Kullanıcı mesajı LLM'e olduğu gibi gider.</div>}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ApprovalCard({ approval }: { approval: Approval }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>();
  const s = approval.summary;
  const act = async (kind: "approve" | "reject") => {
    setBusy(true);
    try {
      const r = await api<{ status: string; code?: string }>(`/api/approvals/${approval.id}/${kind}`, { method: "POST" });
      setResult(r.status === "ALLOWED" ? "Emir iletildi" : `${r.status}${r.code ? ` · ${r.code}` : ""}`);
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-3 mb-3 rounded-md border border-accent bg-accent-soft px-4 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="accent">Onay gerekiyor</Badge>
        <Mono>{approval.id}</Mono>
        <span className="ml-auto text-xs text-muted">{Math.max(0, Math.round((approval.expires - Date.now()) / 1000))} sn</span>
      </div>
      <div className="num text-sm">
        {s.instId} · {s.side === "buy" ? "Al" : "Sat"} · {fmtUsd(s.notionalUsdt)} USDT{s.leverage > 1 ? ` · ${s.leverage}x` : ""}
        {s.slPct ? ` · SL %${s.slPct}` : ""}
        {s.tpPct ? ` · TP %${s.tpPct}` : ""}
      </div>
      <div className="mt-1 text-xs text-muted">{s.rules.filter((r) => r.ok).length}/{s.rules.length} kural geçti</div>
      <div className="mt-3 flex items-center gap-2">
        <Button variant="primary" disabled={busy || Boolean(result)} onClick={() => act("approve")}>Onayla</Button>
        <Button disabled={busy || Boolean(result)} onClick={() => act("reject")}>Reddet</Button>
        {result && <span className="text-xs text-muted">{result}</span>}
      </div>
    </div>
  );
}
