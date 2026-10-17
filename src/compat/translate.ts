// docs: docs/compat.md
import { z } from "zod";
import type { TradeIntent } from "../policy/intent.js";

const positive = z.union([z.string(), z.number()]).transform(Number).pipe(z.number().positive().finite());

/** ATK `spot_place_order` / `swap_place_order` girdisi (paketteki gerçek şema). Bilinmeyen alan reddedilir. */
export const AtkOrderSchema = z
  .object({
    instId: z.string().max(40),
    tdMode: z.enum(["cash", "cross", "isolated"]),
    side: z.enum(["buy", "sell"]),
    ordType: z.enum(["market", "limit", "post_only", "fok", "ioc"]),
    sz: positive,
    tgtCcy: z.enum(["base_ccy", "quote_ccy", "margin"]).optional(),
    px: z.string().max(40).optional(),
    posSide: z.enum(["long", "short", "net"]).optional(),
    reduceOnly: z.boolean().optional(),
    clOrdId: z.string().max(32).optional(),
    tpTriggerPx: positive.optional(),
    tpOrdPx: z.string().max(40).optional(),
    tpOrdKind: z.enum(["condition", "limit"]).optional(),
    tpTriggerPxType: z.enum(["last", "index", "mark"]).optional(),
    slTriggerPx: positive.optional(),
    slOrdPx: z.string().max(40).optional(),
    slTriggerPxType: z.enum(["last", "index", "mark"]).optional(),
    stpMode: z.enum(["cancel_maker", "cancel_taker", "cancel_both"]).optional(),
  })
  .strict();
export type AtkOrder = z.infer<typeof AtkOrderSchema>;

/** Çeviri için gerçek hesap/piyasa verisi (sunucu içi; LLM'e gitmez). */
export interface OrderMarket {
  refPrice: number;
  usdtAvail: number;
  baseAvail: number;
  ctVal: number;
  leverage: number;
}

export type Translation =
  | { ok: true; intent: TradeIntent; notionalUsdt: number; notes: string[] }
  | { ok: false; code: string; detail: string };

const floor4 = (n: number) => Math.floor(n * 1e4 + 1e-9) / 1e4;
const fail = (code: string, detail: string): Translation => ({ ok: false, code, detail });

/**
 * ATK emir argümanını guardian'ın kapalı intent diline çevirir. Mutlak `sz` bakiyenin yüzdesine dönüşür;
 * guardian emri bu yüzdeden yeniden üretir. Fiyat/emir tipi ajandan alınmaz (IOC + fiyat bandı).
 */
export function translateAtkOrder(market: "spot" | "swap", pair: string, o: AtkOrder, m: OrderMarket): Translation {
  const notes: string[] = [];
  if (market === "spot" && o.tdMode !== "cash") return fail("MARGIN_NOT_ALLOWED", "spot sadece tdMode=cash");
  if (market === "spot" && o.tgtCcy === "margin") return fail("SCHEMA_INVALID", "tgtCcy=margin sadece swap");
  if (market === "swap" && o.tdMode === "cash") return fail("SCHEMA_INVALID", "swap tdMode cross|isolated");
  if (market === "swap" && o.reduceOnly) return fail("USE_CLOSE_POSITION", "azaltma için swap_close_position");
  if (market === "swap" && o.posSide && o.posSide !== "net") return fail("HEDGE_MODE_NOT_SUPPORTED", "sadece tek yönlü (net) mod");
  if (!(m.refPrice > 0)) return fail("PRICE_UNAVAILABLE", "referans fiyat yok");

  const buy = o.side === "buy";
  const leverage = market === "swap" ? m.leverage : 1;
  let notional: number;
  let pct: number;
  if (market === "spot") {
    if (buy) {
      // ATK: market alımda sz varsayılan olarak quote (USDT) cinsindendir.
      const quote = o.tgtCcy === "quote_ccy" || (o.ordType === "market" && o.tgtCcy !== "base_ccy");
      notional = quote ? o.sz : o.sz * m.refPrice;
      if (!(m.usdtAvail > 0)) return fail("INSUFFICIENT_BALANCE", "USDT bakiyesi yok");
      pct = (notional / m.usdtAvail) * 100;
    } else {
      const qty = o.tgtCcy === "quote_ccy" ? o.sz / m.refPrice : o.sz;
      notional = qty * m.refPrice;
      if (!(m.baseAvail > 0)) return fail("INSUFFICIENT_BALANCE", "satılacak varlık yok");
      pct = (qty / m.baseAvail) * 100;
    }
  } else {
    notional = o.tgtCcy === "quote_ccy" ? o.sz : o.tgtCcy === "margin" ? o.sz * leverage : o.sz * m.ctVal * m.refPrice;
    if (!(m.usdtAvail > 0)) return fail("INSUFFICIENT_BALANCE", "USDT marjini yok");
    pct = (notional / (m.usdtAvail * leverage)) * 100;
    if (o.tdMode === "cross") notes.push("tdMode cross → isolated");
  }
  if (pct > 100) return fail("INSUFFICIENT_BALANCE", `bakiyenin %${pct.toFixed(1)}'i`);
  const size_pct = floor4(pct);
  if (!(size_pct > 0)) return fail("SIZE_BELOW_MIN", "tutar çok küçük");

  const pctFrom = (px: number) => floor4((Math.abs(px - m.refPrice) / m.refPrice) * 100);
  let sl_pct: number | undefined;
  let tp_pct: number | undefined;
  if (o.slTriggerPx !== undefined) {
    if (buy ? o.slTriggerPx >= m.refPrice : o.slTriggerPx <= m.refPrice) return fail("SL_WRONG_SIDE", "stop-loss giriş fiyatının yanlış tarafında");
    sl_pct = pctFrom(o.slTriggerPx);
  }
  if (o.tpTriggerPx !== undefined) {
    if (buy ? o.tpTriggerPx <= m.refPrice : o.tpTriggerPx >= m.refPrice) return fail("TP_WRONG_SIDE", "take-profit giriş fiyatının yanlış tarafında");
    tp_pct = pctFrom(o.tpTriggerPx);
  }
  if (o.ordType !== "ioc" || o.px !== undefined) notes.push("ordType/px yok sayıldı → IOC, fiyat bantlı");

  return {
    ok: true,
    notionalUsdt: notional,
    notes,
    intent: {
      pair,
      market,
      side: o.side,
      size_pct,
      leverage,
      ...(sl_pct !== undefined ? { sl_pct } : {}),
      ...(tp_pct !== undefined ? { tp_pct } : {}),
      rationale: `ATK ${market}_place_order`,
    },
  };
}
