// docs: docs/policy.md
import type { Policy } from "../config/policy.js";
import { RULES, type RejectCode, type RuleResult, type TradeContext } from "./rules.js";

export interface Verdict {
  allowed: boolean;
  code?: RejectCode;
  results: RuleResult[];
  needsHumanApproval: boolean;
  /** Onay gerekçeleri: SIZE (tutar eşiği), UNTRUSTED_CONTENT (taint). */
  approvalReasons: ("SIZE" | "UNTRUSTED_CONTENT")[];
}

/**
 * Taint onayı: "all" her web/haber sonrası; "web_or_flagged" sadece web sayfası (keyfi kaynak) veya bayraklı
 * (gizli metin, kodlama, talimat) haber sonrası. Temiz OKX haberi sonrası işlem yine kural 13 ile yön doğrulamasından geçer.
 */
function needsUntrustedApproval(ctx: TradeContext, policy: Policy): boolean {
  const u = ctx.untrusted;
  if (!u.tainted || !policy.untrusted.requireApproval) return false;
  if (policy.untrusted.approvalFor === "all") return true;
  return u.source !== "get_news_digest" || u.flagged !== false;
}

/**
 * Deterministik karar: tüm kurallar çalışır (arayüzde hangisinin geçtiği görünsün diye),
 * karar ilk başarısız kuralın koduyla verilir.
 */
export function evaluate(ctx: TradeContext, policy: Policy): Verdict {
  const results = RULES.map((rule) => rule(ctx, policy));
  const firstFail = results.find((r) => !r.ok);
  const approvalReasons: Verdict["approvalReasons"] = [];
  if (!firstFail && ctx.notionalUsdt > policy.humanApprovalAboveUsdt) approvalReasons.push("SIZE");
  if (!firstFail && needsUntrustedApproval(ctx, policy)) approvalReasons.push("UNTRUSTED_CONTENT");
  return {
    allowed: !firstFail,
    code: firstFail?.code,
    results,
    needsHumanApproval: approvalReasons.length > 0,
    approvalReasons,
  };
}
