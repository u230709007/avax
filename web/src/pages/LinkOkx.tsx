// docs: docs/tenants.md
import { useEffect, useState, type ReactNode } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { accountApi, SITE_LABELS, type AccountInfo } from "../Accounts";
import { Button, Card } from "../components/ui";

type Gate = { s: "loading" } | { s: "linked" } | { s: "unlinked"; info: AccountInfo } | { s: "error"; message: string };

/**
 * E-postayla giriş yapan kullanıcının panel kapısı: OKX bağlıysa doğrudan paneli açar,
 * değilse panelin içinde bağlama formunu gösterir.
 */
export function AccountGate({ onLogout, children }: { onLogout: () => void; children: ReactNode }) {
  const [gate, setGate] = useState<Gate>({ s: "loading" });
  const load = async () => {
    setGate({ s: "loading" });
    try {
      const info = await accountApi<AccountInfo>("/api/account");
      setGate(info.okx.linked ? { s: "linked" } : { s: "unlinked", info });
    } catch (e) {
      const st = (e as { status?: number }).status;
      setGate({
        s: "error",
        message:
          st === 401
            ? "Oturum doğrulanamadı. Çıkış yapıp yeniden giriş yap; sorun sürerse sunucunun Supabase ayarlarını kontrol et."
            : st === 404
              ? "Bu Guardian sunucusunda kişisel hesaplar açık değil."
              : "Guardian sunucusuna erişilemiyor. Sunucunun çalıştığından emin ol.",
      });
    }
  };
  useEffect(() => {
    void load();
  }, []);

  if (gate.s === "linked") return <>{children}</>;
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col md:border-x md:border-line">
      <header className="flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur md:px-8">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-ink">
          <ShieldCheck size={20} strokeWidth={2.25} />
        </span>
        <span className="mr-auto text-[15px] font-bold tracking-tight">
          <span className="hidden sm:inline">Sealed Intent </span>
          <span className="text-accent">Guardian</span>
        </span>
        <button aria-label="Çıkış yap" onClick={onLogout} className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:border-faint hover:text-ink">
          <LogOut size={16} strokeWidth={1.75} />
        </button>
      </header>
      <main className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-10 md:px-8">
        {gate.s === "loading" && <Card><div className="px-5 py-10 text-center text-sm text-muted">Hesabın yükleniyor</div></Card>}
        {gate.s === "error" && (
          <Card title="Panel açılamadı">
            <div className="flex flex-col gap-4 px-5 py-5 text-sm text-muted">
              <p>{gate.message}</p>
              <div className="flex gap-2">
                <Button onClick={() => void load()}>Tekrar dene</Button>
                <Button onClick={onLogout}>Çıkış yap</Button>
              </div>
            </div>
          </Card>
        )}
        {gate.s === "unlinked" && <LinkOkx info={gate.info} onLinked={() => setGate({ s: "linked" })} />}
      </main>
    </div>
  );
}

const input = "h-10 rounded-lg border border-line bg-bg px-3 text-sm outline-none focus:border-accent-line disabled:opacity-60";

function LinkOkx({ info, onLinked }: { info: AccountInfo; onLinked: () => void }) {
  const [form, setForm] = useState({ apiKey: "", secretKey: "", passphrase: "", site: "global" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const link = async () => {
    setBusy(true);
    setErr(undefined);
    try {
      await accountApi("/api/account/okx", { method: "PUT", body: form });
      onLinked();
    } catch (e) {
      const code = (e as Error).message;
      setErr(
        code === "OKX_LINK_FAILED"
          ? `OKX anahtarı doğrulanamadı: ${(e as { detail?: string }).detail ?? "bilinmeyen hata"}. Anahtarın demo (simüle) hesapta oluşturulduğundan ve sitenin doğru seçildiğinden emin ol.`
          : code === "CREDENTIALS_REQUIRED"
            ? "API key, secret key ve passphrase'in üçü de gerekli."
            : "OKX bağlantısı kaydedilemedi. Tekrar dene.",
      );
      setBusy(false);
    }
  };
  return (
    <>
      <div className="label">{info.email}</div>
      <h1 className="display mt-3 text-3xl md:text-[40px]">OKX hesabını bağla</h1>
      <p className="mt-4 text-base text-muted">Panelin senin OKX demo hesabınla çalışır. Bir kez bağla, sonraki girişlerde doğrudan panele gelirsin.</p>
      <Card title="Demo API anahtarı oluştur" className="mt-8">
        <ol className="flex list-decimal flex-col gap-2 py-4 pl-10 pr-5 text-sm text-muted">
          <li>OKX'te (Türkiye için tr.okx.com) hesap aç ve giriş yap.</li>
          <li>İşlem menüsünden <span className="text-ink">Demo trading</span> moduna geç.</li>
          <li>Profil → <span className="text-ink">Demo trading API</span> → yeni anahtar oluştur. İzin olarak sadece okuma ve <span className="text-ink">Trade</span> seç; çekim (Withdraw) verme.</li>
          <li>Spot işlem sayfasındaki feragatnameyi bir kez onayla; yoksa emirler 54092 ile reddedilir.</li>
        </ol>
      </Card>
      <Card title="Anahtar bilgileri" className="mt-4">
        <form
          className="flex flex-col gap-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void link();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="label">API key</span>
            <input className={input} autoComplete="off" spellCheck={false} value={form.apiKey} onChange={set("apiKey")} required disabled={busy} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="label">Secret key</span>
            <input className={input} type="password" autoComplete="off" value={form.secretKey} onChange={set("secretKey")} required disabled={busy} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="label">Passphrase</span>
            <input className={input} type="password" autoComplete="off" value={form.passphrase} onChange={set("passphrase")} required disabled={busy} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="label">OKX sitesi</span>
            <select className={input} value={form.site} onChange={set("site")} disabled={busy}>
              {(info.sites.length ? info.sites : ["global"]).map((s) => (
                <option key={s} value={s}>{SITE_LABELS[s] ?? s}</option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted">Anahtarın sunucuda şifreli saklanır; tarayıcına veya yapay zekâya geri gönderilmez. Guardian onu sadece demo modda, kurallarından geçen emirler için kullanır.</p>
          {err && <p role="alert" className="rounded-lg border border-[var(--bad-fg)]/30 bg-[var(--bad-bg)] px-4 py-3 text-sm text-[var(--bad-fg)]">{err}</p>}
          <div>
            <Button type="submit" variant="primary" disabled={busy}>{busy ? "OKX demo hesabı doğrulanıyor" : "Bağla ve panele geç"}</Button>
          </div>
        </form>
      </Card>
    </>
  );
}
