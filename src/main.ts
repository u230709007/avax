// docs: docs/runbook.md
import { bootstrap, bootstrapShared } from "./bootstrap.js";
import { startRuntime } from "./runtime.js";
import { startServer } from "./server.js";
import { startGateway } from "./service/gateway.js";
import { accountsConfigured } from "./tenants/auth.js";
import { TenantRegistry } from "./tenants/registry.js";

/** (A) modu: web arayüzü + sohbet/otonom ajanı (varsayılan Groq, arayüzden Gemini/Claude) + guardian. */
async function main() {
  const shared = await bootstrapShared();
  const app = await bootstrap(shared);
  const uiToken = process.env.UI_TOKEN;
  if (!uiToken || uiToken.length < 16) throw new Error("UI_TOKEN en az 16 karakter olmalı");
  const owner = await startRuntime(app);

  // Kişisel hesaplar: e-postayla giriş yapan herkes kendi OKX demo anahtarını bağlar (docs/tenants.md).
  // Anahtar şifrelemesi TENANT_SECRET_KEY'den, yoksa VAULT_HMAC_KEY'den türetilir.
  const tenants = accountsConfigured()
    ? new TenantRegistry(shared, {
        dir: process.env.TENANTS_DIR ?? "data/tenants",
        masterKey: process.env.TENANT_SECRET_KEY || process.env.VAULT_HMAC_KEY!,
        maxRunning: Number(process.env.TENANT_MAX_RUNNING ?? 20),
        idleMinutes: Number(process.env.TENANT_IDLE_MINUTES ?? 30),
      })
    : undefined;

  const port = Number(process.env.GUARDIAN_PORT ?? 7070);
  // Servis kapısı: uzak MCP (API anahtarlı) + herkese açık kanıt paneli. PUBLIC_PORT=0 kapatır.
  // PUBLIC_URL: tünel adresi (örn. https://xxx.trycloudflare.com); arayüzdeki bağlanma talimatı bunu gösterir.
  const publicPort = Number(process.env.PUBLIC_PORT ?? 7072);
  const publicHost = process.env.PUBLIC_HOST ?? "127.0.0.1";
  const publicUrl = (process.env.PUBLIC_URL || `http://${publicHost === "0.0.0.0" ? "127.0.0.1" : publicHost}:${publicPort}`).replace(/\/$/, "");
  await startServer(owner, {
    port,
    host: process.env.GUARDIAN_HOST ?? "127.0.0.1",
    uiToken,
    tenants,
    service: publicPort > 0 ? { mcpUrl: `${publicUrl}/mcp`, publicUrl } : undefined,
    // UI_ORIGINS: arayüz başka yerden sunuluyorsa (örn. https://avax.vercel.app), virgülle ayrılmış origin listesi.
    corsOrigins: (process.env.UI_ORIGINS ?? "").split(",").map((o) => o.trim().replace(/\/$/, "")).filter(Boolean),
  });

  if (publicPort > 0) await startGateway(app, { host: publicHost, port: publicPort });

  const chain = await app.chain.state();
  console.log(`Guardian: http://127.0.0.1:${port}  (token ile)`);
  console.log(`Kişisel hesaplar: ${tenants ? "açık (e-posta girişi + kullanıcının kendi OKX demo anahtarı)" : "kapalı (SUPABASE_URL / VITE_SUPABASE_URL yok)"}`);
  if (publicPort > 0) console.log(`Servis kapısı: http://${publicHost}:${publicPort}  (panel /, MCP /mcp)`);
  console.log(`OKX ATK: ${app.atkError ? `BAĞLANAMADI: ${app.atkError}` : "bağlı (demo)"}`);
  console.log(`Avalanche: ${chain.reachable ? (chain.policyHashMatches ? "policy eşleşti" : "POLICY HASH UYUŞMUYOR") : `okunamadı: ${chain.error}`}${chain.paused ? " · DURDURULMUŞ" : ""}`);
  console.log(`Sohbet: ${owner.chat ? `açık (${owner.chat.label})` : "kapalı (GROQ_API_KEY, GEMINI_API_KEY veya ANTHROPIC_API_KEY yok)"}`);

  const shutdown = () => void tenants?.stopAll().finally(() => process.exit(0));
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
