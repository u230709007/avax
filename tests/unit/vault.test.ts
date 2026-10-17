import { describe, expect, it } from "vitest";
import { makeVault } from "./helpers.js";

describe("Vault", () => {
  it("tanıtıcılar deterministik ve geri çözülebilir", () => {
    const { vault } = makeVault();
    const a = vault.tokenize("ORD", "612345678901234567", { instId: "AVAX-USDT" });
    const b = vault.tokenize("ORD", "612345678901234567");
    expect(a).toBe(b);
    expect(a).toMatch(/^ORD_[0-9a-f]{8}$/);
    expect(vault.resolve(a, "ORD")?.real).toBe("612345678901234567");
    expect(vault.resolve(a, "POS")).toBeUndefined();
  });

  it("bakiyeyi kovaya çevirir", () => {
    const { vault } = makeVault();
    expect(vault.bucket(10)).toBe("DÜŞÜK");
    expect(vault.bucket(120)).toBe("ORTA");
    expect(vault.bucket(1243.5)).toBe("YÜKSEK");
  });

  it("çift tanıtıcılarını policy'den çözer", () => {
    const { vault } = makeVault();
    expect(vault.resolvePair("P_AVAX", "spot")).toBe("AVAX-USDT");
    expect(vault.resolvePair("P_AVAX", "swap")).toBe("AVAX-USDT-SWAP");
    expect(vault.resolvePair("P_DOGE", "spot")).toBeUndefined();
  });

  it("LLM çıktısındaki sızıntıları yakalar", () => {
    const { vault } = makeVault();
    const known = vault.tokenize("POS", "999");
    const reasons = (v: unknown) => vault.scanForLeaks(v).map((f) => f.reason);
    expect(reasons({ x: "0x1111111111111111111111111111111111111111" })).toContain("EVM_ADDRESS");
    expect(reasons({ id: "612345678901234567" })).toContain("RAW_NUMERIC_ID");
    expect(reasons({ id: 612345678901 })).toContain("RAW_NUMERIC_ID");
    expect(reasons("{{BAL:USDT}}")).toContain("DISPLAY_TAG");
    expect(reasons("ORD_deadbeef")).toContain("UNKNOWN_TOKEN");
    expect(reasons("P_DOGE")).toContain("UNKNOWN_PAIR");
    expect(reasons({ pos: known, pair: "P_AVAX", size: 10 })).toEqual([]);
  });

  it("gösterim etiketlerini sadece sunucuda tutar", () => {
    const { vault } = makeVault();
    const tag = vault.setDisplay("BAL:USDT", "1.000,25 USDT");
    expect(tag).toBe("{{BAL:USDT}}");
    expect(vault.displayValue("{{BAL:USDT}}")).toBe("1.000,25 USDT");
  });
});
