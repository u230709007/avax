// docs: docs/audit.md
/** Kullanım: npm run audit:verify -- <seq>. Kaydın Merkle kanıtını zincirdeki kökle karşılaştırır. */
import "dotenv/config";
import type { Address } from "viem";
import { loadPolicy } from "../src/config/policy.js";
import { Store } from "../src/store/db.js";
import { AuditLog } from "../src/audit/log.js";
import { AvalancheGuard } from "../src/chain/avalanche.js";

const seq = Number(process.argv[2]);
if (!Number.isInteger(seq) || seq < 1) throw new Error("Kullanım: npm run audit:verify -- <seq>");
const { hash } = loadPolicy();
const audit = new AuditLog(new Store(process.env.DB_PATH ?? "data/guardian.db"));
const chain = new AvalancheGuard({
  rpcUrl: process.env.FUJI_RPC_URL ?? "https://api.avax-test.network/ext/bc/C/rpc",
  auditAnchor: process.env.AUDIT_ANCHOR_ADDRESS as Address,
  localPolicyHash: hash,
  cacheSeconds: 0,
});

const chainOk = audit.verifyChain();
console.log(`Yerel hash zinciri: ${chainOk.ok ? "sağlam" : `BOZUK (seq ${(chainOk as { seq: number }).seq})`}`);
const n = await chain.anchorCount();
for (let i = n - 1; i >= 0; i--) {
  const a = await chain.readAnchor(i);
  if (a.fromSeq <= seq && seq <= a.toSeq) {
    const { leaf, proof } = audit.proofFor(seq, a.fromSeq, a.toSeq);
    const ok = AuditLog.verify(leaf, proof, a.root);
    console.log(`seq ${seq} → anchor #${i} [${a.fromSeq}..${a.toSeq}] kök ${a.root}`);
    console.log(ok ? "DOĞRULANDI: kayıt zincirdeki kökle eşleşiyor" : "EŞLEŞMEDİ: kayıt değiştirilmiş");
    process.exit(ok ? 0 : 2);
  }
}
console.log(`seq ${seq} henüz zincire yazılmamış`);
process.exit(1);
