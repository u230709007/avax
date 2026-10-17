import { useState, type ReactNode } from "react";
import { Activity, FileCheck2, LayoutDashboard, MessageSquare, Settings } from "lucide-react";
import type { State } from "../store";
import { api } from "../api";
import { setPaused } from "../killSwitch";
import { Badge, Button } from "./ui";

export type Page = "overview" | "chat" | "decisions" | "audit" | "settings";

const NAV: { id: Page; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Genel bakış", icon: LayoutDashboard },
  { id: "chat", label: "Sohbet", icon: MessageSquare },
  { id: "decisions", label: "Kararlar", icon: Activity },
  { id: "audit", label: "Audit", icon: FileCheck2 },
  { id: "settings", label: "Ayarlar", icon: Settings },
];

export function Shell({ state, page, setPage, children }: { state: State; page: Page; setPage: (p: Page) => void; children: ReactNode }) {
  const nav = NAV.filter((n) => n.id !== "chat" || state.status?.chatEnabled);
  const chain = state.status?.chain;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  const toggle = async () => {
    if (!chain?.policyRegistry) return;
    setBusy(true);
    setErr(undefined);
    try {
      await setPaused(chain.policyRegistry as `0x${string}`, !chain.paused);
      await api("/api/status");
    } catch (e) {
      setErr((e as Error).message.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-line bg-surface md:block">
        <div className="px-5 py-4 text-sm font-semibold">Sealed Intent Guardian</div>
        <nav className="flex flex-col gap-0.5 px-2">
          {nav.map((n) => (
            <button
              key={n.id}
              onClick={() => setPage(n.id)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${page === n.id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-muted hover:text-ink"}`}
            >
              <n.icon size={16} strokeWidth={1.75} />
              {n.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-3 md:px-6">
          <h1 className="mr-auto text-base font-semibold">{NAV.find((n) => n.id === page)?.label}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>OKX Demo</span>
            {!state.status?.okx.connected ? (
              <Badge tone="bad">Bağlı değil</Badge>
            ) : state.portfolioError ? (
              <Badge tone="warn">Veri alınamıyor</Badge>
            ) : (
              <Badge tone="ok">Bağlı</Badge>
            )}
            <span className="ml-2">Fuji policy</span>
            {!chain ? (
              <Badge tone="idle">—</Badge>
            ) : !chain.reachable ? (
              <Badge tone="bad">Okunamadı</Badge>
            ) : chain.policyHashMatches ? (
              <Badge tone="ok">Eşleşti</Badge>
            ) : (
              <Badge tone="bad">Uyuşmuyor</Badge>
            )}
            <span className="ml-2">Durum</span>
            {chain?.paused ? <Badge tone="bad">Durduruldu</Badge> : <Badge tone="ok">Aktif</Badge>}
            {!state.wsOpen && <Badge tone="warn">Canlı akış kesik</Badge>}
          </div>
          {chain?.policyRegistry && (
            <Button variant={chain.paused ? "secondary" : "danger"} onClick={toggle} disabled={busy}>
              {busy ? "Cüzdan bekleniyor" : chain.paused ? "Zincirden devam ettir" : "Zincirden durdur"}
            </Button>
          )}
        </header>
        {err && <div className="border-b border-line bg-[var(--bad-bg)] px-6 py-2 text-xs text-[var(--bad-fg)]">{err}</div>}
        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface md:hidden">
        {nav.map((n) => (
          <button key={n.id} onClick={() => setPage(n.id)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${page === n.id ? "text-accent" : "text-muted"}`}>
            <n.icon size={16} strokeWidth={1.75} />
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
