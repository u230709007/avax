import { describe, expect, it } from "vitest";
import { AtkTools } from "../../src/upstream/atkTools.js";
import type { AtkClient } from "../../src/upstream/atkClient.js";

const tools = (response: unknown) => new AtkTools({ call: async () => response } as unknown as AtkClient);
describe("OKX order acknowledgement", () => {
  it("identifies the actionable disclaimer failure", async () => {
    await expect(tools([{ sCode: "54092", ordId: "" }]).placeOrder("spot", {})).rejects.toMatchObject({ code: "OKX_DISCLAIMER_REQUIRED" });
  });
  it.each([undefined, [], [{}], [{ sCode: "0", ordId: "" }], [{ sCode: "0", ordId: "  " }], [{ sCode: "51000", ordId: "123" }], [{ ordId: "123" }]])("does not report a malformed/rejected acknowledgement as accepted: %j", async response => {
    await expect(tools(response).placeOrder("spot", {})).rejects.toMatchObject({ code: "OKX_ORDER_NOT_CONFIRMED" });
  });
  it("accepts an explicit successful acknowledgement without claiming a fill", async () => {
    const ack = { sCode: "0", ordId: "123", clOrdId: "demo", sMsg: "" };
    await expect(tools([ack]).placeOrder("spot", {})).resolves.toEqual(ack);
  });
});
