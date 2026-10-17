// docs: docs/accounts.md
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck, X } from "lucide-react";
import { guardianUrl } from "./guardianUrl";
import { accountAuth } from "./accountAuth";

export function AccessDialog({ onClose, onDemo, onAdmin, onAccount }: { onClose: () => void; onDemo: () => void; onAdmin: () => void; onAccount: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  useEffect(() => { const el=dialog.current; el?.showModal(); return () => { el?.close(); }; }, []);
  const switchMode = (next: "login" | "signup") => { setMode(next); setError(""); setInfo(""); };
  const attempt = async (task: () => Promise<void>) => { setBusy(true); setError(""); setInfo(""); try { await task(); } catch (e) { setError(authMessage(e, mode)); } finally { setBusy(false); } };
  return <dialog className="lp-dialog access-dialog" ref={dialog} aria-labelledby="access-title" onCancel={e => { e.preventDefault(); onClose(); }}><button className="lp-close" aria-label="Kapat" onClick={onClose}><X/></button><ShieldCheck size={28}/><span className="lp-eyebrow">GUARDIAN / BAŞLA</span><h2 id="access-title">Nasıl devam edelim?</h2><button className="lp-button light" onClick={onDemo}>Demoyu keşfet <ArrowRight size={16}/></button><p>Hesapsız, örnek verilerle normal paneli keşfet.</p><div className="access-divider">KİŞİSEL HESAP</div>{!accountAuth && <p className="access-notice">E-posta girişi henüz etkinleştirilmedi. Şimdilik demoyu keşfedebilirsin.</p>}<div role="tablist" style={{display:"flex",gap:8}}><button type="button" role="tab" aria-selected={mode==="login"} className={mode==="login"?"lp-button light":"lp-button"} disabled={busy} onClick={()=>switchMode("login")}>Giriş yap</button><button type="button" role="tab" aria-selected={mode==="signup"} className={mode==="signup"?"lp-button light":"lp-button"} disabled={busy} onClick={()=>switchMode("signup")}>Kayıt ol</button></div><form onSubmit={e => { e.preventDefault(); void attempt(async () => {
    if (!accountAuth) return;
    const creds = { email: email.trim(), password };
    if (mode === "login") { const {data,error}=await accountAuth.auth.signInWithPassword(creds); if(error || !data.session) throw error ?? new Error(); onAccount(); return; }
    const {data,error}=await accountAuth.auth.signUp({ ...creds, options:{ emailRedirectTo: location.origin+"/" } });
    if (error) throw error;
    if (data.session) { onAccount(); return; }
    setPassword(""); setMode("login"); setInfo("Kayıt alındı. E-postana gelen doğrulama bağlantısına tıkla, sonra giriş yap.");
  }); }}><label htmlFor="account-email">E-posta</label><input id="account-email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} disabled={!accountAuth || busy} required placeholder="sen@ornek.com"/><label htmlFor="account-password">Şifre</label><input id="account-password" type="password" autoComplete={mode==="login"?"current-password":"new-password"} minLength={8} value={password} onChange={e=>setPassword(e.target.value)} disabled={!accountAuth || busy} required/>{mode==="signup" && <p>En az 8 karakter.</p>}{info && <p role="status" className="access-notice">{info}</p>}{error && <p role="alert">{error}</p>}<button className="lp-button light" disabled={!accountAuth || busy}>{busy?"Lütfen bekle…":mode==="login"?"Giriş yap":"Hesap oluştur"}</button></form><button className="access-link" onClick={onAccount} disabled={!accountAuth || busy}>Mevcut oturumumu aç</button><div className="access-divider"/><button className="access-link" onClick={onAdmin}>Yönetici girişi · UI token</button></dialog>;
}
function authMessage(e: unknown, mode: "login" | "signup"): string {
  const code = (e as { code?: string } | null)?.code;
  if (code === "invalid_credentials") return "E-posta veya şifre hatalı.";
  if (code === "email_not_confirmed") return "E-posta adresin henüz doğrulanmadı. Gelen kutundaki bağlantıya tıkla.";
  if (code === "user_already_exists") return "Bu e-posta ile zaten bir hesap var. Giriş yap sekmesini kullan.";
  if (code === "weak_password") return "Şifre çok zayıf. Daha uzun ve tahmin edilmesi zor bir şifre seç.";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit") return "Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.";
  return mode === "login" ? "Giriş tamamlanamadı. Bilgilerini ve bağlantını kontrol edip tekrar dene." : "Kayıt tamamlanamadı. Bilgilerini ve bağlantını kontrol edip tekrar dene.";
}
export const SITE_LABELS: Record<string, string> = { global: "Global (okx.com)", tr: "Türkiye (tr.okx.com)", eea: "EEA (my.okx.com)", us: "US (app.okx.com)" };
export interface AccountInfo { email: string; okx: { linked: boolean; site?: string; since?: number }; sites: string[] }
const accessToken = async () => (await accountAuth?.auth.getSession())?.data.session?.access_token ?? null;
/** Kişisel hesabın Guardian sunucusuna isteği: kimlik Supabase oturumudur, sunucu doğrular (docs/tenants.md). */
export async function accountApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const t = await accessToken();
  if (!t) throw Object.assign(new Error("no_session"), { status: 401 });
  const res = await fetch(guardianUrl(path), { method: init?.method ?? "GET", headers: { authorization: `Bearer ${t}`, ...(init?.body !== undefined ? { "content-type": "application/json" } : {}) }, body: init?.body !== undefined ? JSON.stringify(init.body) : undefined, signal: AbortSignal.timeout(60000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? res.statusText), { status: res.status, detail: (data as { message?: string }).message });
  return data as T;
}
export { accessToken as accountAccessToken };

/** Bağlı OKX hesabını kaldırır (panel Ayarlar'dan). */
export async function unlinkOkx(): Promise<void> {
  await accountApi("/api/account/okx", { method: "DELETE" });
}
