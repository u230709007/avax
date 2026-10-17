import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ApiKeys, PLANS } from "../../src/service/keys.js";
import { createGuardianMcpServer } from "../../src/mcpServer.js";
import { makeGuardian } from "./helpers.js";

describe("Servis — maskeli değerler için panel yönlendirmesi", () => {
  const connect = async (opts?: { ownerPanel?: string }) => {
    const { guardian } = makeGuardian();
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await createGuardianMcpServer(guardian, undefined, opts).connect(st);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(ct);
    return client;
  };

  it("uzak istemciye talimat: etiketi rakam gibi sunma, gerçek değer için yerel panel", async () => {
    const i = (await connect({ ownerPanel: "http://127.0.0.1:7070" })).getInstructions();
    expect(i).toContain("http://127.0.0.1:7070");
    expect(i).toContain("{{BAL:TOTAL}}");
  });

  it("kendi arayüzümüzde (etiketleri ekranda dolduran A modu) talimat yok", async () => {
    expect((await connect()).getInstructions()).toBeUndefined();
  });
});

describe("Servis — API anahtarları ve kota", () => {
  it("anahtar sadece doğru değerle çözülür, iptal edilince geçersiz olur", () => {
    const { store } = makeGuardian();
    const keys = new ApiKeys(store);
    const { id, key } = keys.create("demo-ajan", "pro");
    expect(keys.authenticate(key)).toMatchObject({ id, plan: "pro" });
    expect(keys.authenticate(`${key}x`)).toBeUndefined();
    expect(keys.authenticate(undefined)).toBeUndefined();
    expect(store.db.prepare("SELECT key_hash FROM api_keys").get()).not.toMatchObject({ key_hash: key });
    keys.revoke(id);
    expect(keys.authenticate(key)).toBeUndefined();
  });

  it("işlem kotası dolunca propose_trade reddedilir, okuma tool'ları devam eder", () => {
    const { store } = makeGuardian();
    const keys = new ApiKeys(store);
    const { key } = keys.create("demo-ajan", "sandbox");
    const k = keys.authenticate(key)!;
    for (let i = 0; i < PLANS.sandbox.tradesPerDay; i++) keys.record(k.id, "propose_trade", "ALLOWED");
    keys.record(k.id, "propose_trade", "REJECTED"); // reddedilen öneri işlem kotasına sayılmaz
    expect(keys.usage(k.id)).toEqual({ calls: PLANS.sandbox.tradesPerDay + 1, trades: PLANS.sandbox.tradesPerDay });
    expect(keys.quotaError(k, "propose_trade")).toBe("QUOTA_TRADES_EXCEEDED");
    expect(keys.quotaError(k, "get_market_view")).toBeUndefined();
  });

  it("MCP üzerinden çağrılar sayılır; kota aşımında guardian hiç çalışmaz", async () => {
    const { guardian, store, placed } = makeGuardian();
    const keys = new ApiKeys(store);
    const k = keys.authenticate(keys.create("demo-ajan", "sandbox").key)!;
    const server = createGuardianMcpServer(guardian, {
      before: (tool) => keys.quotaError(k, tool),
      after: (tool, status) => keys.record(k.id, tool, status),
    });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await server.connect(st);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(ct);

    const ok = await client.callTool({ name: "propose_trade", arguments: { pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 } });
    expect(JSON.parse((ok.content as { text: string }[])[0]!.text).status).toBe("ALLOWED");
    expect(keys.usage(k.id).trades).toBe(1);

    for (let i = 1; i < PLANS.sandbox.tradesPerDay; i++) keys.record(k.id, "propose_trade", "ALLOWED");
    const blocked = await client.callTool({ name: "propose_trade", arguments: { pair: "P_AVAX", market: "spot", side: "buy", size_pct: 1 } });
    expect(blocked.isError).toBe(true);
    expect(JSON.parse((blocked.content as { text: string }[])[0]!.text).code).toBe("QUOTA_TRADES_EXCEEDED");
    expect(placed).toHaveLength(1);
  });
});
