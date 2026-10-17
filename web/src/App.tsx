import { useState } from "react";
import { hasToken, useToken } from "./api";
import { Shell, type Page } from "./components/Shell";
import { Button } from "./components/ui";
import { Audit } from "./pages/Audit";
import { Chat } from "./pages/Chat";
import { Decisions } from "./pages/Decisions";
import { Overview } from "./pages/Overview";
import { Settings } from "./pages/Settings";
import { useGuardian } from "./store";

export function App() {
  const [authed, setAuthed] = useState(hasToken());
  if (!authed) return <TokenGate onDone={() => setAuthed(true)} />;
  return <Authed />;
}

function Authed() {
  const { state, dispatch } = useGuardian();
  const [page, setPage] = useState<Page>("overview");
  return (
    <Shell state={state} page={page} setPage={setPage}>
      {page === "overview" && <Overview state={state} goDecisions={() => setPage("decisions")} />}
      {page === "chat" && <Chat state={state} dispatch={dispatch} />}
      {page === "decisions" && <Decisions state={state} />}
      {page === "audit" && <Audit state={state} />}
      {page === "settings" && <Settings state={state} />}
    </Shell>
  );
}

function TokenGate({ onDone }: { onDone: () => void }) {
  const [t, setT] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        className="w-full max-w-sm rounded-lg border border-line bg-surface p-6"
        onSubmit={(e) => {
          e.preventDefault();
          useToken(t.trim());
          onDone();
        }}
      >
        <h1 className="mb-1 text-base font-semibold">Sealed Intent Guardian</h1>
        <p className="mb-4 text-sm text-muted">Yerel arayüz token'ı (.env içindeki UI_TOKEN).</p>
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          type="password"
          className="mb-3 h-9 w-full rounded-md border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
        />
        <Button type="submit" variant="primary" disabled={t.trim().length < 16}>Devam</Button>
      </form>
    </div>
  );
}
