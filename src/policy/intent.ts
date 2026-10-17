// docs: docs/policy.md
import { z } from "zod";

/** LLM'in önerebileceği tek işlem açma dili. `transfer`, adres, ham instId, ham sz yok. */
export const TradeIntentSchema = z
  .object({
    pair: z.string().regex(/^P_[A-Z0-9]+$/),
    market: z.enum(["spot", "swap"]),
    side: z.enum(["buy", "sell"]),
    size_pct: z.number().gt(0).lte(100),
    leverage: z.number().int().min(1).max(125).default(1),
    sl_pct: z.number().gt(0).lte(100).optional(),
    tp_pct: z.number().gt(0).lte(1000).optional(),
    rationale: z.string().max(400).default(""),
  })
  .strict();

export type TradeIntent = z.infer<typeof TradeIntentSchema>;

export const ClosePositionSchema = z.object({ pos_id: z.string().regex(/^POS_[0-9a-f]{8}$/) }).strict();
export const CancelOrderSchema = z.object({ ord_id: z.string().regex(/^ORD_[0-9a-f]{8}$/) }).strict();
export const ReadUrlSchema = z.object({ url: z.string().url().max(500) }).strict();
