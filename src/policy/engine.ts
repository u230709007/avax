// docs: docs/policy.md
import type { Policy } from "../config/policy.js";
import { RULES, type RejectCode, type RuleResult, type TradeContext } from "./rules.js";

export interface Verdict {
  allowed: boolean;
  code?: RejectCode;
  results: RuleResult[];
  needsHumanApproval: boolean;
}

/**
 * Deterministik karar: tüm kurallar çalışır (arayüzde hangisinin geçtiği görünsün diye),
 * karar ilk başarısız kuralın koduyla verilir.
 */
export function evaluate(ctx: TradeContext, policy: Policy): Verdict {
  const results = RULES.map((rule) => rule(ctx, policy));
  const firstFail = results.find((r) => !r.ok);
  return {
    allowed: !firstFail,
    code: firstFail?.code,
    results,
    needsHumanApproval: !firstFail && ctx.notionalUsdt > policy.humanApprovalAboveUsdt,
  };
}
