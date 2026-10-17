import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkDocs } from "../../scripts/docs-check-lib.js";

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "docs-check-"));
  for (const [f, c] of Object.entries(files)) {
    mkdirSync(join(root, f, ".."), { recursive: true });
    writeFileSync(join(root, f), c);
  }
  return root;
}

const base = {
  "CLAUDE.md": "# x\n## Modül haritası\n- `src/a.ts` → a → docs/a.md\n## Komutlar\n",
  "DESIGN.md": "# d\n",
  "LEARN.md": "# l\n[L-001] KURAL: x — NEDEN: y — ALAN: z — 2026-10-16\n",
  "docs/INDEX.md": "- [a](a.md)\n",
  "docs/a.md": "# a\n",
  "src/a.ts": "// docs: docs/a.md\nexport {};\n",
};

describe("docs:check", () => {
  it("temiz repo hatasız", () => {
    expect(checkDocs(repo(base)).errors).toEqual([]);
  });

  it("LEARN.md sınırı aşınca hata verir", () => {
    const many = Array.from({ length: 130 }, (_, i) => `[L-${String(i).padStart(3, "0")}] KURAL: k`).join("\n");
    const r = checkDocs(repo({ ...base, "LEARN.md": many }));
    expect(r.errors.some((e) => e.includes("LEARN.md") && e.includes("sıkıştır"))).toBe(true);
  });

  it("haritada olmayan yeni src klasörü hata verir", () => {
    const r = checkDocs(repo({ ...base, "src/yeni/x.ts": "// docs: docs/a.md\n" }));
    expect(r.errors).toContain("CLAUDE.md modül haritasında eksik: src/yeni");
  });

  it("docs başlığı olmayan kaynak dosya ve INDEX'te olmayan doküman hata verir", () => {
    const r = checkDocs(repo({ ...base, "src/a.ts": "export {};\n", "docs/b.md": "# b\n" }));
    expect(r.errors).toEqual(expect.arrayContaining(["src/a.ts: ilk satırda \"// docs: docs/…\" yok", "docs/INDEX.md'de listelenmemiş: docs/b.md"]));
  });

  it("kod değişip CLAUDE.md değişmezse işaretler", () => {
    expect(checkDocs(repo(base), ["src/a.ts"]).claudeMdStale).toBe(true);
    expect(checkDocs(repo(base), ["src/a.ts", "CLAUDE.md"]).claudeMdStale).toBe(false);
  });
});
