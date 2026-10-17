// docs: docs/ui.md
/**
 * Guardian sunucusunun adresi. Boşsa arayüz guardian'ın kendisinden sunulur (aynı origin, :7070 veya vite proxy).
 * Vercel gibi statik barındırmada VITE_GUARDIAN_URL tünel adresidir (örn. https://xxx.trycloudflare.com);
 * guardian tarafında bu sitenin origin'i UI_ORIGINS'te olmalıdır (CORS).
 */
const base = (import.meta.env.VITE_GUARDIAN_URL ?? "").trim().replace(/\/$/, "");

export const guardianUrl = (path: string) => `${base}${path}`;

export function guardianWsUrl(path: string): string {
  if (!base) return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;
  return `${base.replace(/^http/, "ws")}${path}`;
}
