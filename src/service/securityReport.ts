// docs: docs/ui.md
import { readFileSync } from "node:fs";
import { z } from "zod";
import type { Assessment, SecurityReport } from "./securityTypes.js";

const Report = z.object({
  ts: z.number().int().positive(),
  policyVersion: z.number().int().positive(),
  rows: z.array(z.object({
    Olay: z.string().max(160), Senaryo: z.string().max(240),
    Sonuç: z.string().max(80), Kod: z.string().max(300),
  })).max(200),
});

// Only explicit policy rejections count. Signal/data failures are deliberately inconclusive.
const POLICY_CODES = new Set(["SCHEMA_INVALID", "MASKING_VIOLATION", "INSTRUMENT_NOT_ALLOWED", "SIZE_EXCEEDED", "VOLUME_LIMIT", "RATE_LIMIT", "LEVERAGE_EXCEEDED", "SL_REQUIRED", "SL_TOO_WIDE", "TP_TOO_WIDE", "DAILY_LOSS_LIMIT"]);
export function assess(status: string, code: string): Assessment {
  if (status === "REJECTED" && POLICY_CODES.has(code)) return "blocked";
  if (status === "PENDING_APPROVAL") return "approval";
  if (status === "ÖZET") return "content";
  if (status === "ALLOWED") return "allowed";
  return "inconclusive";
}

/** Public projection: no raw errors, balances, request payloads or credentials. */
export function securityReport(currentPolicyVersion: number, path = "data/attack-replay.json"): SecurityReport {
  try {
    const raw = Report.parse(JSON.parse(readFileSync(path, "utf8")));
    return {
      state: "ready" as const,
      currentPolicyVersion,
      run: {
        ts: raw.ts, policyVersion: raw.policyVersion,
        mode: "direct-guardian-replay" as const,
        rows: raw.rows.map((r, id) => ({
          id, name: r.Senaryo, group: r.Olay,
          status: ["REJECTED", "PENDING_APPROVAL", "ALLOWED", "ÖZET", "ERROR"].includes(r.Sonuç) ? r.Sonuç : "UNKNOWN",
          code: /^[A-Z_]+(?:,[A-Z_]+)*$/.test(r.Kod) ? r.Kod : "UNKNOWN",
          assessment: assess(r.Sonuç, r.Kod),
        })),
      },
    };
  } catch (e) {
    return { state: (e as NodeJS.ErrnoException).code === "ENOENT" ? "missing" as const : "invalid" as const, currentPolicyVersion, run: null };
  }
}
