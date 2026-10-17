import { SecurityTests } from "./pages/SecurityTests";
import { useEffect, useState } from "react";
import { clearAuth, useAccountSession, useToken } from "./api";
import { guardianUrl } from "./guardianUrl";
import { GridBackground } from "./components/GridBackground";
import { Shell, type Page } from "./components/Shell";
import { Card, Mono } from "./components/ui";
import { Audit } from "./pages/Audit";
import { Chat } from "./pages/Chat";
import { Connect } from "./pages/Connect";
import { Decisions } from "./pages/Decisions";
import { Overview } from "./pages/Overview";
import { Settings } from "./pages/Settings";
import { useGuardian } from "./store";
import { Landing, LoginDialog } from "./Landing";
import { AccessDialog, accountAccessToken } from "./Accounts";
import { AccountGate } from "./pages/LinkOkx";
import { accountAuth } from "./accountAuth";
import { DemoPanel } from "./DemoPanel";

export function App() {
  const [authed, setAuthed] = useState<false | "owner" | "account">(false);
  const [view, setView] = useState<"landing" | "demo" | "security">("landing");
  const [admin, setAdmin] = useState(false);
  const [destination, setDestination] = useState<Page>("overview");
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enter = async (token: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(guardianUrl("/api/approvals"), { headers: { "x-ui-token": token }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "Token geçersiz. Lütfen tekrar kontrol et." : "Sunucuya erişilemiyor. Lütfen yeniden dene.");
      const approvals = await res.json();
      if (!Array.isArray(approvals)) throw new Error("Guardian sunucusuna bağlanılamadı.");
      useToken(token);
      setAuthed("owner");
      setLogin(false);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(e instanceof Error && e.name === "Error" ? e.message : "Guardian sunucusuna erişilemiyor. Bağlantıyı kontrol et.");
    } finally { setBusy(false); }
  };
  /** Kişisel hesap: OKX bağlıysa kendi Guardian'ının paneline girer (kimlik Supabase oturumu, docs/tenants.md). */
  const enterAccount = () => {
    useAccountSession(accountAccessToken);
    setAuthed("account");
    window.scrollTo(0, 0);
  };
  const logout = () => {
    if (authed === "account") void accountAuth?.auth.signOut();
    clearAuth();
    setAuthed(false);
    setView("landing");
    window.scrollTo(0, 0);
  };
  // E-posta doğrulama bağlantısından dönüş (?code=): oturum kurulunca doğrudan panel.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (!accountAuth || !(q.has("code") || q.has("access_token"))) return;
    void accountAuth.auth.getSession().then(({ data }) => {
      history.replaceState(null, "", location.pathname);
      if (data.session) enterAccount();
    });
  }, []);
  if (authed === "account") return <><GridBackground /><div className="relative z-10"><AccountGate onLogout={logout}><Authed initialPage={destination === "connect" ? "overview" : destination} onLogout={logout} /></AccountGate></div></>;
  if (authed) return <><GridBackground /><div className="relative z-10"><Authed initialPage={destination} onLogout={logout} /></div></>;
  const showSecurity = () => { setView("security"); window.scrollTo(0, 0); };
  const back = () => { setView("landing"); window.scrollTo(0, 0); };
  const openAccess = () => { setAdmin(false); setError(""); setLogin(true); };
  const showDemo = () => { setLogin(false); setView("demo"); window.scrollTo(0, 0); };
  return <>
    {view === "security" ? <div className="mx-auto max-w-[1320px] px-4 py-8 md:px-8"><button className="mb-6 text-sm text-muted underline" onClick={back}>← Ana sayfaya dön</button><h1 className="display mb-6 text-3xl">Güvenlik Testleri</h1><SecurityTests /></div> : view === "demo" ? <DemoPanel onBack={back} onLogin={openAccess}/> : <Landing onSecurity={showSecurity} onLogin={page => { setDestination(page); openAccess(); }} />}
    {login && (admin ? <LoginDialog busy={busy} error={error} onClose={() => { if (!busy) setLogin(false); }} onSubmit={token => { void enter(token); }} /> : <AccessDialog onClose={() => setLogin(false)} onDemo={showDemo} onAdmin={() => setAdmin(true)} onAccount={() => { setLogin(false); enterAccount(); }} />)}
  </>;
}
function Authed({ initialPage, onLogout }: { initialPage: Page; onLogout: () => void }) {
  const { state, dispatch } = useGuardian();
  const [page, setPage] = useState<Page>(initialPage);
  return (
    <Shell state={state} page={page} setPage={setPage} onLogout={onLogout}>
      {page === "overview" && <Overview state={state} goDecisions={() => setPage("decisions")} />}
      {page === "chat" && (state.status?.chatEnabled ? <Chat state={state} dispatch={dispatch} /> : <ChatOff loaded={Boolean(state.status)} account={state.status?.role === "account"} />)}
      {page === "decisions" && <Decisions state={state} />}
      {page === "audit" && <Audit state={state} />}
      {page === "connect" && state.status?.role !== "account" && <Connect />}
      {page === "security" && <SecurityTests />}
      {page === "settings" && <Settings state={state} />}
    </Shell>
  );
}

function ChatOff({ loaded, account }: { loaded: boolean; account?: boolean }) {
  if (!loaded) return <Card><div className="px-5 py-10 text-center text-sm text-muted">Sunucu durumu yükleniyor</div></Card>;
  if (account) return <Card title="Sohbet kapalı"><div className="px-5 py-5 text-sm text-muted">Bu Guardian sunucusunda yapay zekâ sağlayıcısı tanımlı değil. Kararlar, onaylar ve portföy panelleri çalışmaya devam eder.</div></Card>;
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





