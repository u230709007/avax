// docs: docs/service.md
/**
 * Uzak MCP servisi için API anahtarı yönetimi.
 *   npm run service:key -- create "<ajan adı>" [sandbox|pro|desk]
 *   npm run service:key -- list
 *   npm run service:key -- revoke <ak_id>
 * Anahtar sadece oluşturulurken bir kez yazdırılır; veritabanında sha256'sı tutulur.
 */
import "dotenv/config";
import { Store } from "../src/store/db.js";
import { ApiKeys, isPlan, PLANS } from "../src/service/keys.js";

const [cmd, a, b] = process.argv.slice(2);
const keys = new ApiKeys(new Store(process.env.DB_PATH ?? "data/guardian.db"));

if (cmd === "create" && a) {
  const plan = b ?? "sandbox";
  if (!isPlan(plan)) throw new Error(`Plan: ${Object.keys(PLANS).join(" | ")}`);
  const { id, key } = keys.create(a, plan);
  console.log(`Oluşturuldu: ${id} (${PLANS[plan].label})\nAnahtar (bir daha gösterilmez):\n${key}`);
} else if (cmd === "list") {
  console.table(
    keys.list().map((k) => ({ id: k.id, ad: k.name, plan: k.plan, iptal: k.revoked, ...keys.usage(k.id), olusturma: new Date(k.created).toISOString() })),
  );
} else if (cmd === "revoke" && a) {
  console.log(keys.revoke(a) ? `İptal edildi: ${a}` : `Bulunamadı: ${a}`);
} else {
  console.log('Kullanım: npm run service:key -- create "<ajan adı>" [sandbox|pro|desk] | list | revoke <ak_id>');
  process.exitCode = 1;
}
