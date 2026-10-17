import { describe, expect, it } from "vitest";
import { makeGuardian } from "./helpers.js";
import { createGuardianMcpServer } from "../../src/mcpServer.js";
import { GroqChatHost } from "../../src/chat/groqHost.js";
import { classifyGroqError, describeGroqError, GroqError, groqWithFallback, type ChatRequest, type ChatResponse } from "../../src/llm/groq.js";

const reply = (message: ChatResponse["choices"][number]["message"]): ChatResponse => ({ choices: [{ message, finish_reason: "stop" }] });

describe("GroqChatHost", () => {
  it("tool çağrısını MCP üzerinden guardian'a götürür; LLM'e sadece maskeli veri gider", async () => {
    const { guardian } = makeGuardian();
    const sent: ChatRequest[] = [];
    const script = [
      reply({ role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "get_portfolio_view", arguments: "{}" } }] }),
      reply({ role: "assistant", content: "USDT bakiyen {{BAL:USDT}}." }),
    ];
    const host = new GroqChatHost(createGuardianMcpServer(guardian), async (req) => {
      sent.push(structuredClone(req));
      return script.shift()!;
    });
    await host.connect();
    const text = await host.chat("bakiyem ne?");

    expect(text).toBe("USDT bakiyen {{BAL:USDT}}.");
    expect(sent[0]?.tools?.map((t) => t.function.name)).toContain("propose_trade");
    const toolMsg = sent[1]?.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toContain("{{BAL:USDT}}");
    for (const secret of ["1243.5", "1000.25", "612345678901234567"]) expect(JSON.stringify(sent)).not.toContain(secret);
  });

  it("kota hatasında arayüze Türkçe açıklama verir, geçmişi sıfırlar", async () => {
    const { guardian } = makeGuardian();
    const host = new GroqChatHost(createGuardianMcpServer(guardian), async () => {
      throw new GroqError(429, "Rate limit reached for model `openai/gpt-oss-120b` on tokens per day (TPD): Limit 200000, Used 199990. Please try again in 7m12.5s.");
    });
    await host.connect();
    // Yedek model de aynı hatayı verir: günlük kota → tekrar deneme yok, hemen açıklama.
    await expect(host.chat("selam")).rejects.toThrow(/Groq günlük kotası doldu \(yaklaşık 8 dk sonra\)/);
  });
});

describe("Groq hata sınıflandırma", () => {
  it("dakikalık ve günlük kotayı ayırır, bekleme süresini okur", () => {
    expect(classifyGroqError(new GroqError(429, "Rate limit reached ... on requests per minute (RPM): Limit 30. Please try again in 2.5s."))).toEqual({
      status: 429,
      quota: "minute",
      retryMs: 2500,
    });
    expect(classifyGroqError(new GroqError(429, "... tokens per day (TPD) ... Please try again in 1h2m3s."))).toMatchObject({ quota: "daily", retryMs: 3723000 });
    expect(describeGroqError(new GroqError(401, "Invalid API Key"))).toContain("geçersiz");
  });
  it("429'da yedek modele geçer, diğer hatalarda geçmez", async () => {
    const used: string[] = [];
    const r = await groqWithFallback("ana", "yedek", async (m) => {
      used.push(m);
      if (m === "ana") throw new GroqError(429, "tokens per day (TPD)");
      return "ok";
    });
    expect([r, used]).toEqual(["ok", ["ana", "yedek"]]);
    await expect(groqWithFallback("ana", "yedek", async () => { throw new GroqError(400, "bad"); })).rejects.toThrow("bad");
  });
});
