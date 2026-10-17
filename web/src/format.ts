export const fmtUsd = (n: number | undefined, digits = 2) =>
  n === undefined || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const short = (h: string | null | undefined, n = 6) => (h ? `${h.slice(0, n + 2)}…${h.slice(-4)}` : "—");

export const TOOL_LABELS: Record<string, string> = {
  get_market_view: "Piyasa görünümü",
  get_portfolio_view: "Portföy görünümü",
  get_news_digest: "Haber özeti",
  read_url: "Sayfa okuma",
  propose_trade: "İşlem önerisi",
  close_position: "Pozisyon kapatma",
  cancel_order: "Emir iptali",
  approve: "İnsan onayı",
  agent_note: "Ajan kararı",
  startup: "Sistem açılışı",
};
