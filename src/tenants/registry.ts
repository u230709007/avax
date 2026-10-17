// docs: docs/tenants.md
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { buildApp, type Shared } from "../bootstrap.js";
import { AtkClient, type OkxCredentials } from "../upstream/atkClient.js";
import { startRuntime, type Runtime } from "../runtime.js";

export type OkxSite = "global" | "eea" | "us" | "tr";
export const OKX_SITES: readonly OkxSite[] = ["global", "eea", "us", "tr"];

export class TenantError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

interface Row {
  user_id: string;
  email: string;
  site: string;
  creds: string;
  created: number;
}

/**
 * Kişisel hesaplar: her kullanıcı kendi OKX demo anahtarını bağlar ve kendi Guardian'ını alır
 * (ayrı SQLite, vault, onaylar, 24s limitler, ATK süreci). Anahtarlar AES-256-GCM ile şifreli saklanır,
 * hiçbir API yanıtında geri dönmez. Policy, kill-switch ve IntentGate herkes için ortaktır.
 */
export class TenantRegistry {
  private readonly db: DatabaseSync;
  private readonly key: Buffer;
  private readonly running = new Map<string, { rt: Promise<Runtime>; used: number }>();
  private readonly sweep: NodeJS.Timeout;
  /** Yeni bir kişisel Guardian açıldığında (sunucu WS/olay bağlantısını kurar). */
  onStart: (userId: string, rt: Runtime) => void = () => undefined;
  onStop: (userId: string) => void = () => undefined;

  constructor(
    private readonly shared: Shared,
    private readonly opts: { dir: string; masterKey: string; maxRunning: number; idleMinutes: number },
  ) {
    mkdirSync(opts.dir, { recursive: true });
    this.db = new DatabaseSync(join(opts.dir, "tenants.db"));
    this.db.exec(`CREATE TABLE IF NOT EXISTS tenants (user_id TEXT PRIMARY KEY, email TEXT NOT NULL, site TEXT NOT NULL, creds TEXT NOT NULL, created INTEGER NOT NULL)`);
    this.key = Buffer.from(hkdfSync("sha256", opts.masterKey, "sealed-intent-guardian", "tenant-okx-credentials", 32));
    this.sweep = setInterval(() => void this.stopIdle(), 60_000);
    this.sweep.unref();
  }

  status(userId: string): { linked: boolean; site?: OkxSite; since?: number } {
    const row = this.row(userId);
    return row ? { linked: true, site: row.site as OkxSite, since: row.created } : { linked: false };
  }

  /** Anahtarı önce gerçek OKX demo hesabında dener (bakiye okuma); çalışmazsa kaydetmez. */
  async link(user: { id: string; email: string }, creds: OkxCredentials, site: OkxSite): Promise<void> {
    const probe = new AtkClient({ profile: "tenant", site, credentials: creds, home: this.home(user.id) });
    try {
      await probe.connect();
      await probe.call("account_get_balance", {});
    } catch (e) {
      throw new TenantError("OKX_LINK_FAILED", (e as Error).message.slice(0, 200));
    } finally {
      await probe.close().catch(() => undefined);
    }
    await this.stop(user.id);
    this.db
      .prepare(`INSERT INTO tenants (user_id, email, site, creds, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, site = excluded.site, creds = excluded.creds`)
      .run(user.id, user.email, site, this.seal(JSON.stringify(creds)), Date.now());
  }

  /** Bağlantıyı kaldırır: anahtar silinir, süreç kapanır. Audit kaydı (kullanıcının veritabanı) korunur. */
  async unlink(userId: string): Promise<void> {
    await this.stop(userId);
    this.db.prepare(`DELETE FROM tenants WHERE user_id = ?`).run(userId);
    rmSync(this.home(userId), { recursive: true, force: true });
  }

  /** Kullanıcının çalışan Guardian'ı; yoksa açar. Bağlı OKX hesabı yoksa hata. */
  async open(userId: string): Promise<Runtime> {
    const hit = this.running.get(userId);
    if (hit) {
      hit.used = Date.now();
      return hit.rt;
    }
    const row = this.row(userId);
    if (!row) throw new TenantError("OKX_NOT_LINKED", "OKX hesabı bağlı değil");
    if (this.running.size >= this.opts.maxRunning) await this.stopOldest();
    const creds = JSON.parse(this.open_(row.creds)) as OkxCredentials;
    const rt = (async () => {
      const app = await buildApp(this.shared, {
        dbPath: join(this.dir(userId), "guardian.db"),
        vaultKey: createHmac("sha256", this.key).update(`vault:${userId}`).digest("hex"),
        atk: { profile: "tenant", site: row.site, credentials: creds, home: this.home(userId) },
        tenant: true,
      });
      const runtime = await startRuntime(app);
      this.onStart(userId, runtime);
      return runtime;
    })();
    this.running.set(userId, { rt, used: Date.now() });
    rt.catch(() => this.running.delete(userId));
    return rt;
  }

  /** Kapanış: tüm kişisel Guardian'lar durur, kayıt veritabanı kapanır. */
  async stopAll(): Promise<void> {
    clearInterval(this.sweep);
    await Promise.all([...this.running.keys()].map((id) => this.stop(id)));
    if (this.db.isOpen) this.db.close();
  }

  private async stop(userId: string): Promise<void> {
    const hit = this.running.get(userId);
    if (!hit) return;
    this.running.delete(userId);
    this.onStop(userId);
    await hit.rt.then((rt) => rt.stop()).catch(() => undefined);
  }

  private async stopIdle(): Promise<void> {
    const limit = Date.now() - this.opts.idleMinutes * 60_000;
    for (const [id, r] of this.running) {
      // Otonom mod açık kullanıcı boşta sayılmaz: döngüsü sunucuda çalışmaya devam eder.
      const auto = await r.rt.then((rt) => rt.autonomous.get()).catch(() => false);
      if (r.used < limit && !auto) await this.stop(id);
    }
  }

  private async stopOldest(): Promise<void> {
    const oldest = [...this.running.entries()].sort((a, b) => a[1].used - b[1].used)[0];
    if (!oldest) return;
    await this.stop(oldest[0]);
  }

  private row(userId: string): Row | undefined {
    return this.db.prepare(`SELECT * FROM tenants WHERE user_id = ?`).get(userId) as Row | undefined;
  }

  private dir(userId: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new TenantError("BAD_USER", "Geçersiz kullanıcı kimliği");
    return resolve(this.opts.dir, userId);
  }

  private home(userId: string): string {
    return join(this.dir(userId), "home");
  }

  private seal(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
    return [iv, c.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
  }

  private open_(sealed: string): string {
    const parts = sealed.split(".").map((p) => Buffer.from(p, "base64"));
    if (parts.length !== 3) throw new TenantError("CREDENTIALS_CORRUPT", "Şifreli anahtar kaydı bozuk");
    const [iv, tag, body] = parts as [Buffer, Buffer, Buffer];
    const d = createDecipheriv("aes-256-gcm", this.key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString("utf8");
  }
}
