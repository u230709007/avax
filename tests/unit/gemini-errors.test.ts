import { describe, expect, it } from "vitest";
import { classifyGeminiError, describeGeminiError, withModelFallback, withRetry } from "../../src/llm/gemini.js";

// Google'ın 429 gövdesinin biçimi (ApiError.message içinde JSON olarak gelir).
const body = (quotaId: string, retry = "33s") =>
  Object.assign(
    new Error(
      JSON.stringify({
        error: {
          code: 429,
          message: "You exceeded your current quota, please check your plan and billing details.",
          status: "RESOURCE_EXHAUSTED",
          details: [
            { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId }] },
            { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: retry },
          ],
        },
      }),
    ),
    { status: 429 },
  );

describe("Gemini hata sınıflandırma", () => {
  it("günlük kotayı ayırt eder ve ham JSON yerine açıklama verir", () => {
    const e = body("GenerateRequestsPerDayPerProjectPerModel-FreeTier");
    expect(classifyGeminiError(e)).toEqual({ status: 429, quota: "daily", retryMs: 33000 });
    const msg = describeGeminiError(e);
    expect(msg).toContain("günlük kotası doldu");
    expect(msg).not.toContain("{");
  });
  it("dakikalık kotada önerilen bekleme süresini söyler", () => {
    const e = body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "12.5s");
    expect(classifyGeminiError(e)).toMatchObject({ quota: "minute", retryMs: 12500 });
    expect(describeGeminiError(e)).toContain("13 sn");
  });
  it("günlük kotada tekrar denemez", async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw body("GenerateRequestsPerDayPerProjectPerModel-FreeTier"); })).rejects.toThrow();
    expect(calls).toBe(1);
  });
  it("kota dolunca yedek modele geçer", async () => {
    const used: string[] = [];
    const r = await withModelFallback("ana", "yedek", async (m) => {
      used.push(m);
      if (m === "ana") throw body("GenerateRequestsPerDayPerProjectPerModel-FreeTier");
      return "ok";
    });
    expect(r).toBe("ok");
    expect(used).toEqual(["ana", "yedek"]);
  });
});
