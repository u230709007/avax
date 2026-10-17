import { useState } from "react";
import { hasToken, useToken } from "./api";
import { Shell, type Page } from "./components/Shell";
import { Button, Card, Mono } from "./components/ui";
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
      {page === "chat" && (state.status?.chatEnabled ? <Chat state={state} dispatch={dispatch} /> : <ChatOff loaded={Boolean(state.status)} />)}
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
        className="w-full max-w-md rounded-xl border border-line bg-surface p-8"
        onSubmit={(e) => {
          e.preventDefault();
          useToken(t.trim());
          onDone();
        }}
      >
        <div className="label">Yerel erişim</div>
        <h1 className="display mt-3 text-3xl">
          Sealed Intent <span className="text-accent">Guardian</span>
        </h1>
        <p className="mb-6 mt-3 text-sm text-muted">Yerel arayüz token'ı (.env içindeki UI_TOKEN).</p>
        <input
          value={t}
          onChange={(e) => setT(e.target.value)}
          type="password"
          aria-label="UI token"
          className="mb-4 h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent-line"
        />
        <Button type="submit" variant="primary" disabled={t.trim().length < 16}>Devam</Button>
      </form>
    </div>
  );
}

function ChatOff({ loaded }: { loaded: boolean }) {
  if (!loaded) return <Card><div className="px-5 py-10 text-center text-sm text-muted">Sunucu durumu yükleniyor</div></Card>;
  return (
    <Card title="Sohbet kapalı">
      <div className="flex flex-col gap-3 px-5 py-5 text-sm text-muted">
        <p>Sunucu açılırken bir LLM sağlayıcısı bulamadı. Proje kökündeki <Mono>.env</Mono> dosyasına şunları yazıp <Mono>npm run dev</Mono>'u yeniden başlatın:</p>
        <pre className="rounded-lg border border-line bg-bg p-3 font-mono text-xs text-ink">LLM_PROVIDER=groq{"\n"}GROQ_API_KEY=...</pre>
        <p>Başlangıçta terminalde <Mono>Sohbet: açık (Groq ...)</Mono> satırı görünmeli. Gemini veya Anthropic için <Mono>GEMINI_API_KEY</Mono> / <Mono>ANTHROPIC_API_KEY</Mono> da kullanılabilir.</p>
      </div>
    </Card>
  );
}
