// docs: docs/masking.md
import type { Vault } from "../masking/vault.js";

const TAG_RE = /\{\{\s*((?:BAL|POS):[A-Za-z0-9_]+|PNL)\s*\}\}/g;
const ANY_TAG_RE = /\{\{[^{}]{1,64}\}\}/g;

/**
 * SADECE ekrana giden metinde gösterim etiketlerini gerçek değerle değiştirir.
 * Sonuç LLM geçmişine asla geri yazılmaz. Allowlist dışı etiketler "[gizli]" olur.
 */
export function detokenize(text: string, vault: Vault): string {
  return text
    .replace(TAG_RE, (m, tag: string) => vault.displayValue(`{{${tag}}}`) ?? m)
    .replace(ANY_TAG_RE, (m) => (vault.displayValue(m) ? m : "[gizli]"));
}
