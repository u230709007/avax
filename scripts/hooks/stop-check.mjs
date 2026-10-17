// Stop hook: docs:check çalıştırır. Hata veya güncellenmemiş CLAUDE.md varsa Claude'a geri bildirim verir (exit 2).
// Sonsuz döngüyü önlemek için ikinci denemede (stop_hook_active) engellemez.
import { execSync } from "node:child_process";

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let active = false;
  try {
    active = Boolean(JSON.parse(input || "{}").stop_hook_active);
  } catch {
    /* boş girdi */
  }
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  let out = "";
  let failed = false;
  try {
    out = execSync("npx tsx scripts/docs-check.ts", { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    failed = true;
    out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
  const stale = /CLAUDE\.md \(Güncel durum/.test(out);
  if ((failed || stale) && !active) {
    process.stderr.write(
      `Görev bitirme kontrol listesi tamamlanmadı:\n${out}\n` +
        "1) Testler geçti mi? 2) İlgili docs/ dosyası güncel mi? 3) CLAUDE.md → Güncel durum + Son güncelleme güncel mi? 4) Hata yaptıysan LEARN.md'ye kural ekledin mi?\n",
    );
    process.exit(2);
  }
  process.exit(0);
});
