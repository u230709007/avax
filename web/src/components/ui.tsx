import type { ReactNode } from "react";

type Tone = "ok" | "bad" | "warn" | "idle" | "accent";

const TONE: Record<Tone, string> = {
  ok: "border-[var(--ok-fg)]/30 bg-[var(--ok-bg)] text-[var(--ok-fg)]",
  bad: "border-[var(--bad-fg)]/30 bg-[var(--bad-bg)] text-[var(--bad-fg)]",
  warn: "border-[var(--warn-fg)]/30 bg-[var(--warn-bg)] text-[var(--warn-fg)]",
  idle: "border-line bg-[var(--idle-bg)] text-[var(--idle-fg)]",
  accent: "border-accent-line bg-accent-soft text-accent",
};

export const DOT: Record<Tone, string> = {
  ok: "bg-[var(--ok-fg)]",
  bad: "bg-[var(--bad-fg)]",
  warn: "bg-[var(--warn-fg)]",
  idle: "bg-faint",
  accent: "bg-accent",
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export const OUTCOME_BADGE: Record<string, { tone: Tone; label: string }> = {
  ALLOWED: { tone: "ok", label: "İzin" },
  OK: { tone: "idle", label: "Okuma" },
  REJECTED: { tone: "bad", label: "Ret" },
  WARNING: { tone: "warn", label: "Uyarı" },
  PENDING_APPROVAL: { tone: "accent", label: "Onay bekliyor" },
  ERROR: { tone: "bad", label: "Hata" },
};

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const b = OUTCOME_BADGE[outcome] ?? { tone: "idle" as const, label: outcome };
  return <Badge tone={b.tone}>{b.label}</Badge>;
}

export function Card({ title, action, children, className = "" }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3.5">
          <h2 className="label text-ink">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Metric({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <div className="label">{label}</div>
      <div className="num mt-3 text-3xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-2 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  const styles = {
    primary: "bg-accent text-accent-ink border-transparent hover:opacity-90",
    secondary: "bg-surface text-ink border-line hover:border-faint",
    danger: "bg-surface text-[var(--bad-fg)] border-line hover:bg-[var(--bad-bg)]",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

/** Üstüne gelince / odaklanınca yanında açılan etiket balonu. */
export function Tip({ text, side = "bottom", children }: { text: ReactNode; side?: "right" | "bottom"; children: ReactNode }) {
  const pos = side === "right" ? "left-full top-1/2 ml-3 -translate-y-1/2" : "right-0 top-full mt-2";
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md border border-line bg-surface-muted px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink opacity-0 transition-opacity group-has-[:focus-visible]/tip:opacity-100 group-hover/tip:opacity-100 ${pos}`}
      >
        {text}
      </span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-xs ${className}`}>{children}</span>;
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <button aria-label="Kapat" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="relative z-10 h-full w-full max-w-xl overflow-y-auto border-l border-line bg-surface">
        <header className="sticky top-0 flex items-center justify-between border-b border-line bg-surface px-5 py-3.5">
          <h2 className="label text-ink">{title}</h2>
          <Button onClick={onClose}>Kapat</Button>
        </header>
        <div className="p-5">{children}</div>
      </aside>
    </div>
  );
}

export function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed text-muted">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
