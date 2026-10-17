// docs: docs/testing.md
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative as nativeRelative } from "node:path";
import { execSync } from "node:child_process";

export const LIMITS = { claude: 150, design: 250, learn: 120, learnRules: 40, doc: 300 } as const;

export interface CheckResult {
  errors: string[];
  warnings: string[];
  /** CLAUDE.md, kod değiştiği halde güncellenmemiş mi? (Stop hook bunu engelleyici sayar.) */
  claudeMdStale: boolean;
}

/** Windows'ta da "/" ayraçlı göreli yol (LEARN L-012). */
const relative = (from: string, to: string) => nativeRelative(from, to).replaceAll("\\", "/");

const lines = (p: string) => readFileSync(p, "utf8").split("\n").length;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function section(md: string, heading: string): string {
  const start = md.indexOf(`## ${heading}`);
  if (start < 0) return "";
  const rest = md.slice(start + heading.length + 3);
  const end = rest.search(/\n## /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** Saf kontrol: test edilebilmesi için kök dizin parametre. */
export function checkDocs(root: string, changedFiles?: string[]): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const p = (f: string) => join(root, f);

  for (const [file, max] of [["CLAUDE.md", LIMITS.claude], ["DESIGN.md", LIMITS.design], ["LEARN.md", LIMITS.learn]] as const) {
    if (!existsSync(p(file))) errors.push(`${file} yok`);
    else if (lines(p(file)) > max) errors.push(`${file} ${lines(p(file))} satır > ${max}${file === "LEARN.md" ? " — LEARN.md'yi sıkıştırın (bkz. LEARN.md başı)" : ""}`);
  }
  if (existsSync(p("LEARN.md"))) {
    const rules = (readFileSync(p("LEARN.md"), "utf8").match(/^\[L-\d{3}\]/gm) ?? []).length;
    if (rules > LIMITS.learnRules) errors.push(`LEARN.md ${rules} kural > ${LIMITS.learnRules} — sıkıştırın`);
  }

  // Modül haritası: listelenen yollar var mı, src altındaki her şey listelenmiş mi?
  if (existsSync(p("CLAUDE.md"))) {
    const map = section(readFileSync(p("CLAUDE.md"), "utf8"), "Modül haritası");
    const listed = [...map.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]!.replace(/\/$/, ""));
    for (const l of listed) if (/^(src|web|contracts|scripts|tests|attack-site|examples|docs)\b/.test(l) && !existsSync(p(l.replace(/\{.*\}/, "")))) errors.push(`Modül haritasındaki yol yok: ${l}`);
    if (existsSync(p("src"))) {
      for (const e of readdirSync(p("src"))) {
        const rel = `src/${e}`;
        if (!listed.some((l) => l === rel || l.startsWith(`${rel}/`))) errors.push(`CLAUDE.md modül haritasında eksik: ${rel}`);
      }
    }
  }

  // docs/INDEX.md her dokümanı listeler, linkler kırık değil
  if (existsSync(p("docs"))) {
    const index = existsSync(p("docs/INDEX.md")) ? readFileSync(p("docs/INDEX.md"), "utf8") : "";
    if (!index) errors.push("docs/INDEX.md yok");
    for (const f of walk(p("docs")).filter((f) => f.endsWith(".md"))) {
      const rel = relative(p("docs"), f);
      if (rel !== "INDEX.md" && !index.includes(`(${rel})`)) errors.push(`docs/INDEX.md'de listelenmemiş: docs/${rel}`);
      if (lines(f) > LIMITS.doc) errors.push(`docs/${rel} ${lines(f)} satır > ${LIMITS.doc}`);
    }
    for (const m of index.matchAll(/\]\(([^)]+\.md)\)/g)) if (!existsSync(join(p("docs"), m[1]!))) errors.push(`Kırık link: docs/${m[1]}`);
  }

  // Her kaynak dosyanın ilk satırı ilgili dokümanı gösterir
  for (const f of walk(p("src")).filter((f) => f.endsWith(".ts"))) {
    const first = readFileSync(f, "utf8").split("\n")[0] ?? "";
    const m = first.match(/^\/\/ docs: (docs\/[\w./-]+\.md)/);
    if (!m) errors.push(`${relative(root, f)}: ilk satırda "// docs: docs/…" yok`);
    else if (!existsSync(p(m[1]!))) errors.push(`${relative(root, f)}: ${m[1]} yok`);
  }

  // Kod değişti ama CLAUDE.md değişmedi mi?
  let claudeMdStale = false;
  if (changedFiles) {
    const codeChanged = changedFiles.some((f) => /^(src|web\/src|contracts\/src|policy\.json)/.test(f));
    if (codeChanged && !changedFiles.includes("CLAUDE.md")) {
      claudeMdStale = true;
      warnings.push("Kod değişti ama CLAUDE.md (Güncel durum / Son güncelleme) güncellenmedi");
    }
  }
  return { errors, warnings, claudeMdStale };
}

export function gitChangedFiles(root: string): string[] | undefined {
  try {
    return execSync("git status --porcelain --untracked-files=all", { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((l) => l.slice(3).trim());
  } catch {
    return undefined;
  }
}
