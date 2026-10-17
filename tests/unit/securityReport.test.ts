import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assess, securityReport } from "../../src/service/securityReport.js";

const dirs: string[] = [];
function file(content: string) {
  const dir = mkdtempSync(join(tmpdir(), "guardian-report-"));
  dirs.push(dir);
  const path = join(dir, "report.json");
  writeFileSync(path, content);
  return path;
}
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });
describe("public security evidence", () => {
  it("never counts infrastructure, unknown or signal failures as policy success", () => {
    for (const code of ["CHAIN_UNREACHABLE", "ATK_ERROR", "PRICE_UNAVAILABLE", "POLICY_HASH_MISMATCH", "SIGNAL_NOT_CONFIRMED", "PAUSED_ONCHAIN", "NEW_ERROR"])
      expect(assess("REJECTED", code)).toBe("inconclusive");
    expect(assess("REJECTED", "LEVERAGE_EXCEEDED")).toBe("blocked");
    expect(assess("ALLOWED", "LEVERAGE_EXCEEDED")).toBe("allowed");
    expect(assess("ÖZET", "MORSE")).toBe("content");
    expect(assess("PENDING_APPROVAL", "")).toBe("approval");
  });
  it("projects legacy reports without leaking raw errors or added private fields", () => {
    const report = securityReport(6, file(JSON.stringify({ ts: 1234, policyVersion: 5, secret: "private", rows: [{ Olay: "test", Senaryo: "case", Sonuç: "ERROR", Kod: "secret URL or credential", input: "private" }] })));
    expect(report.state).toBe("ready");
    expect(report.run?.rows[0]?.code).toBe("UNKNOWN");
    expect(report.run?.policyVersion).toBe(5);
    expect(report.currentPolicyVersion).toBe(6);
    expect(JSON.stringify(report)).not.toContain("private");
    expect(JSON.stringify(report)).not.toContain("credential");
  });
  it("distinguishes missing and malformed reports without generating results", () => {
    expect(securityReport(5, file("{}")).state).toBe("invalid");
    expect(securityReport(5, file("invalid")).run).toBeNull();
    expect(securityReport(5, file("{}") + ".missing").state).toBe("missing");
  });
});
