// docs: docs/threat-model.md
/**
 * Saldırı demosu için GERÇEK saldırı sayfalarını yerelde sunar (127.0.0.1:7071).
 * Ajan bu sayfaları read_url ile gerçek HTTP üzerinden okur.
 */
import "dotenv/config";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";

const root = join(import.meta.dirname, "pages");
const port = Number(process.env.ATTACK_SITE_PORT ?? 7071);

createServer(async (req, res) => {
  const path = normalize(new URL(req.url ?? "/", "http://x").pathname).replace(/^(\.\.[/\\])+/, "");
  const file = path === "/" ? "index" : path.slice(1);
  if (!/^[a-z-]+(\.html)?$/.test(file)) return res.writeHead(404).end();
  try {
    const body = await readFile(join(root, file.endsWith(".html") ? file : `${file}.html`));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => console.log(`Saldırı sayfaları: http://localhost:${port}/{morse,hidden,fake-support,clean}.html`));
