// docs: docs/tenants.md
import { createHash } from "node:crypto";
import { config } from "dotenv";

// Arayüzle aynı Supabase projesi: .env'de SUPABASE_URL yoksa web/.env.local'daki VITE_ değerleri kullanılır.
config({ path: "web/.env.local", quiet: true });

export interface AccountUser {
  id: string;
  email: string;
}

const url = () => (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL)?.trim().replace(/\/$/, "");
const key = () => (process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY)?.trim();

export const accountsConfigured = (): boolean => Boolean(url() && key());

const cache = new Map<string, { user: AccountUser | null; until: number }>();

/**
 * Supabase erişim token'ını sunucu tarafında doğrular (Auth `/user` ucu imzayı ve süreyi kontrol eder).
 * Tarayıcının söylediği kullanıcı kimliğine güvenilmez; kimlik sadece bu yanıttan alınır.
 */
export async function verifyAccessToken(token: string): Promise<AccountUser | null> {
  const base = url();
  const apikey = key();
  if (!base || !apikey || token.length < 20 || token.length > 4096) return null;
  const id = createHash("sha256").update(token).digest("hex");
  const hit = cache.get(id);
  if (hit && hit.until > Date.now()) return hit.user;
  let user: AccountUser | null = null;
  try {
    const res = await fetch(`${base}/auth/v1/user`, { headers: { apikey, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const body = (await res.json()) as { id?: string; email?: string; email_confirmed_at?: string | null };
      if (body.id && body.email && body.email_confirmed_at !== null) user = { id: body.id, email: body.email };
    } else if (res.status >= 500) {
      return null;
    }
  } catch {
    return null;
  }
  if (cache.size > 5000) cache.clear();
  cache.set(id, { user, until: Date.now() + (user ? 60_000 : 10_000) });
  return user;
}
