import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import type { App, Shared } from "../../src/bootstrap.js";
import type { Runtime } from "../../src/runtime.js";
import { TenantError, TenantRegistry } from "../../src/tenants/registry.js";
import { makeGuardian, policy, policyHash } from "./helpers.js";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const UI_TOKEN = "owner-token-0123456789";

vi.mock("../../src/tenants/auth.js", () => ({
  accountsConfigured: () => true,
  verifyAccessToken: async (t: string) =>
    t === "jwt-a" ? { id: USER_A, email: "a@example.com" } : t === "jwt-b" ? { id: USER_B, email: "b@example.com" } : null,
}));

function runtime(label: string): Runtime {
  const g = makeGuardian();
  g.audit.append({ source: "system", tool: "startup", input: { label }, outcome: "OK" });
  const app = {
    ...g,
    chain: { state: async () => ({ reachable: true, policyHashMatches: true, paused: false, localHash: policyHash, checkedAt: 0 }) },
    atk: { isConnected: () => true, missingTools: () => [], close: async () => undefined },
    anchorer: { disabled: label !== "owner", list: () => [], forSeq: () => undefined, tick: async () => undefined, onAnchored: () => undefined },
    policyHash,
  } as unknown as App;
  return { app, autonomous: { get: () => false, set: () => undefined, intervalSeconds: 300, runNow: async () => undefined }, stop: async () => undefined };
}

describe("Kişisel hesaplar — her kullanıcı sadece kendi Guardian'ını görür", () => {
  let server: FastifyInstance;
  const tenantA = runtime("tenant-a");
  beforeAll(async () => {
    const { startServer } = await import("../../src/server.js");
    const tenants = {
      onStart: () => undefined,
      onStop: () => undefined,
      status: (id: string) => (id === USER_A ? { linked: true, site: "global" } : { linked: false }),
      open: async (id: string) => {
        if (id === USER_A) return tenantA;
        throw new TenantError("OKX_NOT_LINKED", "OKX hesabı bağlı değil");
      },
    } as unknown as TenantRegistry;
    server = await startServer(runtime("owner"), { port: 0, uiToken: UI_TOKEN, tenants });
  });
  afterAll(async () => server.close());

  const get = (url: string, headers: Record<string, string> = {}) => server.inject({ method: "GET", url, headers });
  const label = (rows: { input: { label?: string } }[]) => rows.find((r) => r.input.label)?.input.label;

  it("kimliksiz veya geçersiz oturumla API kapalı", async () => {
    expect((await get("/api/decisions")).statusCode).toBe(401);
    expect((await get("/api/decisions", { authorization: "Bearer sahte" })).statusCode).toBe(401);
  });

  it("UI token sahibin, e-posta oturumu kullanıcının kendi kayıtlarını döner", async () => {
    expect(label((await get("/api/decisions", { "x-ui-token": UI_TOKEN })).json())).toBe("owner");
    expect(label((await get("/api/decisions", { authorization: "Bearer jwt-a" })).json())).toBe("tenant-a");
  });

  it("kullanıcının rolü account; MCP anahtarları sadece sahibe açık", async () => {
    expect((await get("/api/status", { authorization: "Bearer jwt-a" })).json()).toMatchObject({ role: "account", account: { email: "a@example.com" } });
    expect((await get("/api/service", { authorization: "Bearer jwt-a" })).statusCode).toBe(403);
    expect((await get("/api/service", { "x-ui-token": UI_TOKEN })).statusCode).toBe(200);
  });

  it("OKX bağlamamış kullanıcı panele giremez ama hesap durumunu görür", async () => {
    const res = await get("/api/portfolio", { authorization: "Bearer jwt-b" });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "OKX_NOT_LINKED" });
    expect((await get("/api/account", { authorization: "Bearer jwt-b" })).json()).toMatchObject({ email: "b@example.com", okx: { linked: false } });
  });

  it("eksik OKX anahtarı reddedilir", async () => {
    const res = await server.inject({ method: "PUT", url: "/api/account/okx", headers: { authorization: "Bearer jwt-b" }, payload: { apiKey: "x" } });
    expect(res.statusCode).toBe(400);
  });
});

describe("Kişisel hesaplar — anahtar saklama", () => {
  const dir = mkdtempSync(join(tmpdir(), "tenants-"));
  const shared = { policy, hash: policyHash, chain: {} } as unknown as Shared;
  const reg = new TenantRegistry(shared, { dir, masterKey: "test-master-key-0123456789abcdef", maxRunning: 2, idleMinutes: 30 });
  afterAll(async () => {
    await reg.stopAll();
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it("bağlı olmayan kullanıcı OKX_NOT_LINKED alır, geçersiz kimlik reddedilir", async () => {
    expect(reg.status(USER_A)).toEqual({ linked: false });
    await expect(reg.open(USER_A)).rejects.toMatchObject({ code: "OKX_NOT_LINKED" });
    await expect(reg.open("../../etc")).rejects.toThrow();
  });

  it("anahtar AES-GCM ile şifrelenir, düz metin saklanmaz, değiştirilirse açılmaz", () => {
    const r = reg as unknown as { seal(p: string): string; open_(s: string): string };
    const sealed = r.seal(JSON.stringify({ apiKey: "AK", secretKey: "SECRET-123", passphrase: "PP" }));
    expect(sealed).not.toContain("SECRET-123");
    expect(JSON.parse(r.open_(sealed)).secretKey).toBe("SECRET-123");
    const [iv, tag, body] = sealed.split(".");
    const flipped = Buffer.from(body!, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => r.open_([iv, tag, flipped.toString("base64")].join("."))).toThrow();
  });
});
