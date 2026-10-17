// docs: docs/testing.md
/** npm run docs:check — doküman sınırları, modül haritası, linkler, kaynak başlıkları. Hata varsa çıkış kodu 1. */
import { checkDocs, gitChangedFiles } from "./docs-check-lib.js";

const r = checkDocs(process.cwd(), gitChangedFiles(process.cwd()));
for (const e of r.errors) console.error(`HATA  ${e}`);
for (const w of r.warnings) console.warn(`UYARI ${w}`);
if (!r.errors.length && !r.warnings.length) console.log("docs:check temiz");
process.exit(r.errors.length ? 1 : 0);
