// docs: docs/ui.md
export type Assessment = "blocked" | "approval" | "content" | "inconclusive" | "allowed";
export interface SecurityReport {
  state: "ready" | "missing" | "invalid";
  currentPolicyVersion: number;
  run: null | {
    ts: number;
    policyVersion: number;
    mode: "direct-guardian-replay";
    rows: { id: number; name: string; group: string; status: string; code: string; assessment: Assessment }[];
  };
}
