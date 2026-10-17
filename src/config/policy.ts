// docs: docs/policy.md
import { readFileSync } from "node:fs";
import { keccak256, toBytes } from "viem";
import { z } from "zod";

const PolicySchema = z
  .object({
    version: z.number().int(),
    pairs: z.record(
      z.string().regex(/^P_[A-Z0-9]+$/),
      z.object({ spot: z.string(), swap: z.string() }).strict(),
    ),
    quoteCcy: z.literal("USDT"),
    maxOrderUsdt: z.number().positive(),
    maxOrderPctOfBalance: z.number().positive().max(100),
    rolling24hMaxUsdt: z.number().positive(),
    maxOrdersPerMinute: z.number().int().positive(),
    maxLeverage: z.number().int().min(1),
    requireStopLoss: z.object({ spot: z.boolean(), swap: z.boolean() }).strict(),
    maxStopLossPct: z.number().positive(),
    maxTakeProfitPct: z.number().positive(),
    priceBandPct: z.number().positive(),
    dailyLossLimitPct: z.number().positive(),
    humanApprovalAboveUsdt: z.number().nonnegative(),
    approvalTtlSeconds: z.number().int().positive(),
    balanceBucketsUsdt: z.tuple([z.number(), z.number()]),
    chainCacheSeconds: z.number().int().positive(),
    anchorEveryDecisions: z.number().int().positive(),
    anchorEverySeconds: z.number().int().positive(),
  })
  .strict();

export type Policy = Readonly<z.infer<typeof PolicySchema>>;

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) deepFreeze(v);
    Object.freeze(obj);
  }
  return obj;
}

/** Ham dosya baytlarının keccak256'sı; zincirdeki PolicyRegistry.policyHash ile karşılaştırılır. */
export function hashPolicyFile(raw: string): `0x${string}` {
  return keccak256(toBytes(raw));
}

export interface LoadedPolicy {
  policy: Policy;
  hash: `0x${string}`;
}

export function parsePolicy(raw: string): LoadedPolicy {
  const policy = deepFreeze(PolicySchema.parse(JSON.parse(raw)));
  return { policy, hash: hashPolicyFile(raw) };
}

export function loadPolicy(path = "policy.json"): LoadedPolicy {
  return parsePolicy(readFileSync(path, "utf8"));
}
