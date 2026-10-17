// docs: docs/tenants.md
import type { App } from "./bootstrap.js";
import { createGuardianMcpServer } from "./mcpServer.js";
import { SwitchingHost } from "./chat/switch.js";
import { llmProvider } from "./llm/provider.js";

export interface Autonomous {
  get(): boolean;
  set(v: boolean): void;
  intervalSeconds: number;
  runNow(): Promise<string | undefined>;
}

/** Bir Guardian örneğinin çalışma zamanı: sohbet ajanı ve otonom döngü. Sahip ve her kişisel hesap için ayrı kurulur. */
export interface Runtime {
  app: App;
  chat?: SwitchingHost;
  autonomous: Autonomous;
  stop(): Promise<void>;
}

export async function startRuntime(app: App, opts: { chat?: boolean; intervalSeconds?: number } = {}): Promise<Runtime> {
  const intervalSeconds = opts.intervalSeconds ?? 300;
  let chat: SwitchingHost | undefined;
  if (opts.chat !== false && llmProvider()) {
    chat = new SwitchingHost(() => createGuardianMcpServer(app.guardian));
    await chat.connect();
  }

  let enabled = app.store.getKv("autonomous") === "1";
  let timer: NodeJS.Timeout | undefined;
  /** Tek otonom tur: ajan kendi planlar (piyasa → portföy → haber → öneri), guardian kurallarla karar verir. */
  const runNow = async (): Promise<string | undefined> => {
    if (!chat || chat.isBusy()) return undefined;
    const text = await chat.autonomousTick();
    app.guardian.agentNote(text);
    return text;
  };
  const tick = async () => {
    try {
      await runNow();
    } catch {
      /* hata audit/WS'e host tarafından yansıtıldı; tur atlanır */
    }
  };
  const schedule = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
    if (!enabled || !chat) return;
    void tick();
    timer = setInterval(() => void tick(), intervalSeconds * 1000);
  };

  app.anchorer.start();
  schedule();
  return {
    app,
    chat,
    autonomous: {
      get: () => enabled,
      set: (v) => {
        enabled = v;
        app.store.setKv("autonomous", v ? "1" : "0");
        schedule();
      },
      intervalSeconds,
      runNow,
    },
    async stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      app.anchorer.stop();
      await app.atk.close().catch(() => undefined);
      app.store.db.close();
    },
  };
}
