import { afterEach, describe, expect, it } from "vitest";
import { llmProvider } from "../../src/llm/provider.js";

const KEYS = ["LLM_PROVIDER", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"] as const;
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function env(v: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, v);
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("llmProvider", () => {
  it("LLM_PROVIDER açıkça verilirse onu kullanır", () => {
    env({ LLM_PROVIDER: "gemini", ANTHROPIC_API_KEY: "x" });
    expect(llmProvider()).toBe("gemini");
  });
  it("verilmezse anahtarı olanı seçer", () => {
    env({ GEMINI_API_KEY: "g" });
    expect(llmProvider()).toBe("gemini");
    env({ ANTHROPIC_API_KEY: "a" });
    expect(llmProvider()).toBe("anthropic");
  });
  it("anahtar yoksa sohbet kapalı", () => {
    env({});
    expect(llmProvider()).toBeUndefined();
  });
});
