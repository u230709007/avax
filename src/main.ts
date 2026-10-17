// docs: docs/runbook.md
import { bootstrap } from "./bootstrap.js";
import { createGuardianMcpServer } from "./mcpServer.js";
import { ChatHost, type AgentHost } from "./chat/host.js";
import { GeminiChatHost } from "./chat/geminiHost.js";
import { llmProvider } from "./llm/provider.js";
import { startServer } from "./server.js";

/** (A) modu: web arayüzü + Opus 5.5 sohbet/otonom ajanı + guardian. */
async function main() {
  const app = await bootstrap();
  const uiToken = process.env.UI_TOKEN;
  if (!uiToken || uiToken.length < 16) throw new Error("UI_TOKEN en az 16 karakter olmalı");

  let chat: AgentHost | undefined;
  const provider = llmProvider();
  if (provider) {
    const server = createGuardianMcpServer(app.guardian);
    chat = provider === "gemini" ? new GeminiChatHost(server) : new ChatHost(server);
    await chat.connect();
  }

  const intervalSeconds = 300;
  let autonomous = app.store.getKv("autonomous") === "1";
  let timer: NodeJS.Timeout | undefined;
  const schedule = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (!autonomous || !chat) return;
    const tick = async () => {
      if (!chat || chat.isBusy()) return;
      try {
        const text = await chat.autonomousTick();
        app.guardian.agentNote(text);
      } catch {
        /* hata audit/WS'e host tarafından yansıtıldı; tur atlanır */
      }
    };
    void tick();
    timer = setInterval(() => void tick(), intervalSeconds * 1000);
  };

  app.anchorer.start();
  const port = Number(process.env.GUARDIAN_PORT ?? 7070);
  await startServer(app, {
    port,
    uiToken,
    chat,
    autonomous: {
      get: () => autonomous,
      set: (v) => {
        autonomous = v;
        app.store.setKv("autonomous", v ? "1" : "0");
        schedule();
      },
      intervalSeconds,
    },
  });
  schedule();

  const chain = await app.chain.state();
  console.log(`Guardian: http://127.0.0.1:${port}  (token ile)`);
  console.log(`OKX ATK: ${app.atkError ? `BAĞLANAMADI: ${app.atkError}` : "bağlı (demo)"}`);
  console.log(`Avalanche: ${chain.reachable ? (chain.policyHashMatches ? "policy eşleşti" : "POLICY HASH UYUŞMUYOR") : `okunamadı: ${chain.error}`}${chain.paused ? " · DURDURULMUŞ" : ""}`);
  console.log(`Sohbet: ${chat ? `açık (${chat.label})` : "kapalı (GEMINI_API_KEY veya ANTHROPIC_API_KEY yok)"}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
