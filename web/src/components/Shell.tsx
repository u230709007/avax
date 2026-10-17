import { useState, type ReactNode } from "react";
import { Activity, Cpu, FileCheck2, LayoutDashboard, MessageSquare, OctagonX, Play, Plug, Power, Radio, Settings, ShieldCheck, X } from "lucide-react";
import type { State } from "../store";
import { api } from "../api";
import { setPaused } from "../killSwitch";
import { DOT, Tip } from "./ui";

export type Page = "overview" | "chat" | "decisions" | "audit" | "settings";

const NAV: { id: Page; label: string; icon: typeof Activity }[] = [
  { id: "overview", label: "Genel bakış", icon: LayoutDashboard },
  { id: "chat", label: "Sohbet", icon: MessageSquare },
  { id: "decisions", label: "Kararlar", icon: Activity },
  { id: "audit", label: "Audit", icon: FileCheck2 },
  { id: "settings", label: "Ayarlar", icon: Settings },
];

const HEAD: Record<Page, { title: string; sub: string }> = {
  overview: { title: "Maskele. Denetle. Kanıtla.", sub: "Ajan sadece maskeli veriyi görür; her emri guardian kodu kurallardan geçirir, kayıtları Avalanche Fuji'de kanıtlar." },
  chat: { title: "Sohbet", sub: "Ajanla konuşun. Bir mesaja tıklayınca LLM'e giden maskeli içerik sağda görünür." },
  decisions: { title: "Kararlar", sub: "Guardian'ın verdiği her karar; kuralları, karantina özeti ve hash'iyle." },
  audit: { title: "Audit", sub: "Karar kayıtlarının Merkle kökleri Avalanche Fuji'deki AuditAnchor kontratında." },
  settings: { title: "Ayarlar", sub: "Otonom mod, zincir ve ATK durumu, salt okunur politika." },
};

type Tone = keyof typeof DOT;

export function Shell({ state, page, setPage, children }: { state: State; page: Page; setPage: (p: Page) => void; children: ReactNode }) {
  const nav = NAV;
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

  const okx: [Tone, string] = !state.status?.okx.connected ? ["bad", "Bağlı değil"] : state.portfolioError ? ["warn", "Veri alınamıyor"] : ["ok", "Bağlı"];
  const policy: [Tone, string] = !chain ? ["idle", "Bilinmiyor"] : !chain.reachable ? ["bad", "Okunamadı"] : chain.policyHashMatches ? ["ok", "Eşleşti"] : ["bad", "Uyuşmuyor"];
  const head = HEAD[page];
  const idx = nav.findIndex((n) => n.id === page) + 1;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] md:border-x md:border-line">
      <aside className="sticky top-0 z-30 hidden h-screen w-[72px] shrink-0 flex-col items-center border-r border-line bg-bg/85 backdrop-blur md:flex">
        <div className="flex h-16 w-full items-center justify-center border-b border-line">
          <Logo />
        </div>
        <nav className="mt-4 flex flex-col gap-2">
          {nav.map((n) => (
            <Tip key={n.id} text={n.label} side="right">
              <button
                aria-label={n.label}
                aria-current={page === n.id ? "page" : undefined}
                onClick={() => setPage(n.id)}
                className={`relative flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
                  page === n.id ? "border-accent-line bg-accent-soft text-accent" : "border-transparent text-muted hover:border-line hover:text-ink"
                }`}
              >
                <n.icon size={18} strokeWidth={1.75} />
              </button>
            </Tip>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur sm:gap-3 md:px-8">
          <span className="md:hidden">
            <Logo />
          </span>
          <span className="mr-auto truncate text-[15px] font-bold tracking-tight">
            <span className="hidden sm:inline">Sealed Intent </span>
            <span className="text-accent">Guardian</span>
          </span>
          {state.status?.chatEnabled && <ModelPicker state={state} onError={setErr} />}
          <StatusIcon icon={Plug} tone={okx[0]} label={`OKX demo · ${okx[1]}`} />
          <StatusIcon icon={ShieldCheck} tone={policy[0]} label={`Fuji policy · ${policy[1]}`} />
          <StatusIcon icon={Power} tone={chain?.paused ? "bad" : "ok"} label={`Durum · ${chain?.paused ? "Durduruldu" : "Aktif"}`} />
          <StatusIcon icon={Radio} tone={state.wsOpen ? "ok" : "warn"} label={`Canlı akış · ${state.wsOpen ? "Açık" : "Kesik"}`} />
          {chain?.policyRegistry && (
            <Tip text={busy ? "Cüzdan bekleniyor" : chain.paused ? "Zincirden devam ettir" : "Zincirden durdur"}>
              <button
                aria-label={chain.paused ? "Zincirden devam ettir" : "Zincirden durdur"}
                onClick={toggle}
                disabled={busy}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-50 ${
                  chain.paused ? "border-line text-ink hover:border-faint" : "border-[var(--bad-fg)]/40 text-[var(--bad-fg)] hover:bg-[var(--bad-bg)]"
                }`}
              >
                {chain.paused ? <Play size={16} strokeWidth={1.75} /> : <OctagonX size={16} strokeWidth={1.75} />}
              </button>
            </Tip>
          )}
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1320px] flex-1 overflow-x-hidden px-4 pb-10 md:px-8">
          {err && (
            <div className="mt-6 flex items-center gap-3 rounded-xl border border-[var(--warn-fg)]/30 bg-[var(--warn-bg)] px-5 py-4 text-sm text-[var(--warn-fg)]">
              <span className="mr-auto">{err}</span>
              <button aria-label="Kapat" onClick={() => setErr(undefined)}>
                <X size={16} />
              </button>
            </div>
          )}
          <div className={page === "overview" ? "pb-10 pt-12 md:pt-16" : "pb-8 pt-10"}>
            <div className="label">
              {String(idx).padStart(2, "0")} · {nav[idx - 1]?.label}
            </div>
            <h1 className={`display mt-3 ${page === "overview" ? "text-4xl md:text-6xl" : "text-3xl md:text-[40px]"}`}>{head.title}</h1>
            <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">{head.sub}</p>
          </div>
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-bg md:hidden">
        {nav.map((n) => (
          <button
            key={n.id}
            aria-label={n.label}
            onClick={() => setPage(n.id)}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 ${page === n.id ? "text-accent" : "text-muted"}`}
          >
            <n.icon size={18} strokeWidth={1.75} />
            {page === n.id && <span className="font-mono text-[9px] uppercase tracking-[0.14em]">{n.label}</span>}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Logo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-ink">
      <ShieldCheck size={20} strokeWidth={2.25} />
    </span>
  );
}

/** Sağ üst model seçici: Groq varsayılan; anahtarı olan Gemini/Claude seçilebilir. Kurallar hangisinde olursa olsun aynıdır. */
function ModelPicker({ state, onError }: { state: State; onError: (m: string) => void }) {
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
      <span className="relative flex h-9 w-9 shrink-0 items-center rounded-lg border border-line text-muted hover:text-ink focus-within:border-accent-line sm:w-[112px]">
        <Cpu size={16} strokeWidth={1.75} className="pointer-events-none absolute left-2.5" />
        <select
          aria-label="Ajan modeli"
          value={active}
          disabled={busy || state.agentBusy}
          onChange={(e) => void change(e.target.value)}
          className="h-full w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent pl-8 pr-2 font-mono text-[11px] uppercase tracking-[0.14em] text-transparent outline-none disabled:cursor-wait disabled:opacity-60 sm:text-ink"
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

function StatusIcon({ icon: Icon, tone, label }: { icon: typeof Activity; tone: Tone; label: string }) {
  return (
    <Tip text={label}>
      <span tabIndex={0} aria-label={label} className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted outline-none hover:text-ink focus-visible:border-accent-line">
        <Icon size={16} strokeWidth={1.75} />
        <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      </span>
    </Tip>
  );
}
