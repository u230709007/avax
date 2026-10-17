import { useEffect, useReducer } from "react";
import { api, connectWs, type WsEvent } from "./api";
import type { Anchor, Approval, AuditRow, ChainSnapshot, ChatMessage, Portfolio, Snapshot, Status } from "./types";

export interface State {
  wsOpen: boolean;
  status?: Status;
  portfolio?: Portfolio;
  portfolioError?: string;
  decisions: AuditRow[];
  anchors: Anchor[];
  approvals: Approval[];
  chat: ChatMessage[];
  pendingTraffic: NonNullable<ChatMessage["traffic"]>;
  agentBusy: boolean;
}

type Action =
  | { type: "ws"; open: boolean }
  | { type: "status"; status: Status }
  | { type: "portfolio"; portfolio?: Portfolio; error?: string }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "chain"; chain: ChainSnapshot }
  | { type: "decisions"; rows: AuditRow[] }
  | { type: "audit"; row: AuditRow }
  | { type: "anchors"; anchors: Anchor[] }
  | { type: "anchor"; anchor: Anchor }
  | { type: "approvals"; approvals: Approval[] }
  | { type: "approval"; approval: Approval }
  | { type: "approval_update"; id: string; status: string }
  | { type: "chat_user"; text: string }
  | { type: "chat_agent"; display: string; raw: string; mode: string; ts: number }
  | { type: "chat_system"; text: string }
  | { type: "traffic"; t: NonNullable<ChatMessage["traffic"]>[number] }
  | { type: "busy"; busy: boolean };

const initial: State = { wsOpen: false, decisions: [], anchors: [], approvals: [], chat: [], pendingTraffic: [], agentBusy: false };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "ws":
      return { ...s, wsOpen: a.open };
    case "status":
      return { ...s, status: a.status };
    case "portfolio":
      return { ...s, portfolio: a.portfolio ?? s.portfolio, portfolioError: a.error };
    case "snapshot":
      return s.portfolio ? { ...s, portfolio: { ...s.portfolio, snapshot: a.snapshot }, portfolioError: undefined } : s;
    case "chain":
      return s.status ? { ...s, status: { ...s.status, chain: { ...s.status.chain, ...a.chain } } } : s;
    case "decisions":
      return { ...s, decisions: a.rows };
    case "audit":
      return s.decisions.some((d) => d.seq === a.row.seq) ? s : { ...s, decisions: [a.row, ...s.decisions].slice(0, 500) };
    case "anchors":
      return { ...s, anchors: a.anchors };
    case "anchor":
      return { ...s, anchors: [a.anchor, ...s.anchors] };
    case "approvals":
      return { ...s, approvals: a.approvals };
    case "approval":
      return { ...s, approvals: [a.approval, ...s.approvals.filter((x) => x.id !== a.approval.id)] };
    case "approval_update":
      return { ...s, approvals: s.approvals.map((x) => (x.id === a.id ? { ...x, status: a.status } : x)) };
    case "chat_user":
      return { ...s, chat: [...s.chat, { id: crypto.randomUUID(), role: "user", display: a.text, ts: Date.now() }], pendingTraffic: [] };
    case "chat_agent":
      return {
        ...s,
        chat: [
          ...s.chat,
          {
            id: crypto.randomUUID(),
            role: a.mode === "autonomous" ? "system" : "agent",
            display: a.display,
            raw: a.raw,
            ts: a.ts,
            traffic: s.pendingTraffic,
          },
        ],
        pendingTraffic: [],
      };
    case "chat_system":
      return { ...s, chat: [...s.chat, { id: crypto.randomUUID(), role: "system", display: a.text, ts: Date.now() }] };
    case "traffic":
      return { ...s, pendingTraffic: [...s.pendingTraffic, a.t] };
    case "busy":
      return { ...s, agentBusy: a.busy };
  }
}

export function useGuardian() {
  const [state, dispatch] = useReducer(reducer, initial);

  useEffect(() => {
    const loadStatus = () => api<Status>("/api/status").then((status) => dispatch({ type: "status", status })).catch(() => undefined);
    const loadPortfolio = () =>
      api<Portfolio>("/api/portfolio")
        .then((portfolio) => dispatch({ type: "portfolio", portfolio }))
        .catch((e: Error) => dispatch({ type: "portfolio", error: e.message }));
    void loadStatus();
    void loadPortfolio();
    void api<AuditRow[]>("/api/decisions?limit=200").then((rows) => dispatch({ type: "decisions", rows })).catch(() => undefined);
    void api<Anchor[]>("/api/anchors").then((anchors) => dispatch({ type: "anchors", anchors })).catch(() => undefined);
    void api<Approval[]>("/api/approvals").then((approvals) => dispatch({ type: "approvals", approvals })).catch(() => undefined);
    const statusTimer = window.setInterval(loadStatus, 30_000);
    const portfolioTimer = window.setInterval(loadPortfolio, 30_000);

    const stop = connectWs(
      (e: WsEvent) => {
        switch (e.type) {
          case "audit":
            dispatch({ type: "audit", row: e.data as AuditRow });
            break;
          case "portfolio":
            dispatch({ type: "snapshot", snapshot: e.data as Snapshot });
            break;
          case "chain":
            dispatch({ type: "chain", chain: e.data as ChainSnapshot });
            break;
          case "anchor":
            dispatch({ type: "anchor", anchor: e.data as Anchor });
            break;
          case "approval":
            dispatch({ type: "approval", approval: e.data as Approval });
            break;
          case "approval_update": {
            const d = e.data as { id: string; status: string };
            dispatch({ type: "approval_update", id: d.id, status: d.status });
            break;
          }
          case "llm_traffic":
            dispatch({ type: "traffic", t: e.data as NonNullable<ChatMessage["traffic"]>[number] });
            break;
          case "assistant": {
            const d = e.data as { display: string; raw: string; mode: string; ts: number };
            if (d.mode === "autonomous") dispatch({ type: "chat_agent", ...d });
            break;
          }
          case "agent_error":
            dispatch({ type: "chat_system", text: `Ajan hatası: ${(e.data as { message: string }).message}` });
            break;
        }
      },
      (open) => dispatch({ type: "ws", open }),
    );
    return () => {
      stop();
      clearInterval(statusTimer);
      clearInterval(portfolioTimer);
    };
  }, []);

  return { state, dispatch };
}

export type Dispatch = ReturnType<typeof useGuardian>["dispatch"];
