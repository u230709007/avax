// docs: docs/atk-integration.md
import type { AtkClient } from "./atkClient.js";

/** OKX v5 yanıtları için minimal tipler (sadece kullandığımız alanlar). */
export interface OkxBalanceDetail {
  ccy: string;
  eq: string;
  availBal: string;
  eqUsd: string;
}
export interface OkxPosition {
  posId: string;
  instId: string;
  instType: string;
  pos: string;
  posSide: string;
  mgnMode: string;
  avgPx: string;
  upl: string;
  uplRatio: string;
  lever: string;
  notionalUsd: string;
}
export interface OkxBill {
  billId: string;
  ccy: string;
  bal: string;
  balChg: string;
  ts: string;
}
export interface OkxOrderAck {
  ordId: string;
  clOrdId: string;
  sCode: string;
  sMsg: string;
}
export interface OkxOrder {
  ordId: string;
  instId: string;
  side: string;
  sz: string;
  px: string;
  state: string;
  ordType: string;
}

const num = (s: string | undefined): number => (s === undefined || s === "" ? NaN : Number(s));

export class AtkTools {
  constructor(private readonly atk: AtkClient) {}

  async lastPrice(instId: string): Promise<number> {
    const rows = await this.atk.call<{ last: string }[]>("market_get_ticker", { instId });
    return num(rows?.[0]?.last);
  }

  /** OKX mum dizisi: [ts, o, h, l, c, vol, ...] (yeni → eski). Eski → yeni sıralı kapanışları döner. */
  async closes(instId: string, bar = "15m", limit = 100): Promise<{ ts: number; close: number }[]> {
    const rows = await this.atk.call<string[][]>("market_get_candles", { instId, bar, limit });
    return (rows ?? []).map((r) => ({ ts: Number(r[0]), close: Number(r[4]) })).reverse();
  }

  async instrument(instId: string, instType: "SPOT" | "SWAP"): Promise<{ tickSz: number; lotSz: number; minSz: number; ctVal: number }> {
    const rows = await this.atk.call<{ instId: string; tickSz: string; lotSz: string; minSz: string; ctVal: string }[]>(
      "market_get_instruments",
      { instType, instId },
    );
    const r = rows?.find((x) => x.instId === instId) ?? rows?.[0];
    if (!r) throw new Error(`Enstrüman bulunamadı: ${instId}`);
    return { tickSz: num(r.tickSz), lotSz: num(r.lotSz), minSz: num(r.minSz), ctVal: num(r.ctVal) };
  }

  async balance(): Promise<{ totalEqUsd: number; details: OkxBalanceDetail[] }> {
    const rows = await this.atk.call<{ totalEq: string; details: OkxBalanceDetail[] }[]>("account_get_balance", {});
    const acct = rows?.[0];
    return { totalEqUsd: num(acct?.totalEq), details: acct?.details ?? [] };
  }

  async positions(): Promise<OkxPosition[]> {
    return (await this.atk.call<OkxPosition[]>("account_get_positions", {})) ?? [];
  }

  async bills(limit = 100): Promise<OkxBill[]> {
    return (await this.atk.call<OkxBill[]>("account_get_bills", { limit })) ?? [];
  }

  async openOrders(market: "spot" | "swap"): Promise<OkxOrder[]> {
    return (await this.atk.call<OkxOrder[]>(market === "spot" ? "spot_get_orders" : "swap_get_orders", {})) ?? [];
  }

  async placeOrder(market: "spot" | "swap", params: Record<string, unknown>): Promise<OkxOrderAck> {
    const rows = await this.atk.call<OkxOrderAck[]>(market === "spot" ? "spot_place_order" : "swap_place_order", params);
    const ack = rows?.[0];
    if (!ack || (ack.sCode && ack.sCode !== "0")) throw new Error(`OKX emri reddetti: ${ack?.sCode} ${ack?.sMsg}`);
    return ack;
  }

  async setLeverage(instId: string, lever: number, mgnMode: "isolated" | "cross"): Promise<void> {
    await this.atk.call("swap_set_leverage", { instId, lever: String(lever), mgnMode });
  }

  async cancelOrder(market: "spot" | "swap", instId: string, ordId: string): Promise<void> {
    await this.atk.call(market === "spot" ? "spot_cancel_order" : "swap_cancel_order", { instId, ordId });
  }

  async closePosition(instId: string, mgnMode: string, posSide?: string): Promise<void> {
    await this.atk.call("swap_close_position", { instId, mgnMode, ...(posSide && posSide !== "net" ? { posSide } : {}) });
  }

  async news(coins: string[], limit = 10): Promise<{ title?: string; summary?: string; content?: string; coins?: string[] }[]> {
    const rows = await this.atk.call<unknown>("news_get_by_coin", {
      coins: coins.join(","),
      importance: "low",
      detailLvl: "summary",
      language: "en-US",
      limit,
    });
    if (Array.isArray(rows)) {
      // news yanıtı ya düz liste ya da [{details:[...]}] biçimindedir
      const first = rows[0] as { details?: unknown[] } | undefined;
      if (first && Array.isArray(first.details)) return first.details as never;
      return rows as never;
    }
    return [];
  }
}
