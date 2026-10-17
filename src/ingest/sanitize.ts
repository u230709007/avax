// docs: docs/quarantine.md
/**
 * Güvenilmeyen metin (web sayfası, haber) için deterministik ön işleme.
 * Tespitler sadece risk sinyalidir; güvenlik bunlara dayanmaz (asıl koruma guardian kurallarıdır).
 */

export const SANITIZE_FLAGS = [
  "HIDDEN_TEXT",
  "INVISIBLE_CHARS",
  "UNICODE_TAGS",
  "MORSE",
  "BASE64",
  "HEX_TEXT",
  "INSTRUCTION",
  "ADDRESS",
] as const;
export type SanitizeFlag = (typeof SANITIZE_FLAGS)[number];

export interface SanitizeResult {
  /** Görünmez karakterlerden arındırılmış, düz metin (karantina modeline gider). */
  text: string;
  flags: SanitizeFlag[];
  /** Çözülmüş gizli içerik; sadece audit/arayüz içindir, hiçbir LLM'e gitmez. */
  decoded: { kind: SanitizeFlag; text: string }[];
}

const MAX_TEXT = 20_000;

const MORSE: Record<string, string> = {
  ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F", "--.": "G", "....": "H",
  "..": "I", ".---": "J", "-.-": "K", ".-..": "L", "--": "M", "-.": "N", "---": "O", ".--.": "P",
  "--.-": "Q", ".-.": "R", "...": "S", "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X",
  "-.--": "Y", "--..": "Z", "-----": "0", ".----": "1", "..---": "2", "...--": "3", "....-": "4",
  ".....": "5", "-....": "6", "--...": "7", "---..": "8", "----.": "9",
};

const INSTRUCTION_PATTERNS: RegExp[] = [
  /ignore (all |the )?(previous|prior|above) (instructions|rules)/i,
  /(system|developer) prompt/i,
  /\b(send|transfer|withdraw|pay)\b.{0,40}\b(all|everything|funds|balance|wallet|address|usdt|avax|btc|eth)\b/i,
  /\b\d{2,3}\s*x\b.{0,30}\b(long|short|leverage)\b/i,
  /\b(long|short)\b.{0,30}\b\d{2,3}\s*x\b/i,
  /\ball[- ]in\b|\bentire balance\b|\bfull balance\b/i,
  /(önceki|tüm) (talimat|kural)lar(ı)? (yok say|unut)/i,
  /\b(gönder|transfer et|öde|çek)\b/i,
  /tüm bakiye|bütün bakiye|tüm parayı|bütün parayı/i,
  /cüzdan(ına|a)? (adres|gönder)/i,
];

const ZERO_WIDTH_RE = /[​-‏‪-‮⁠-⁤﻿]/g;
const UNICODE_TAG_RE = /[\u{E0000}-\u{E007F}]/gu;
const HIDDEN_CSS_RE =
  /(display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(px|em|rem)?\s*[;"']|opacity\s*:\s*0(\.0+)?\s*[;"']|color\s*:\s*(transparent|#fff(fff)?\b|white)|left\s*:\s*-\d{3,}px|aria-hidden\s*=\s*["']true)/i;
const EVM_ADDRESS_RE = /0x[a-fA-F0-9]{40}/;
const BASE58_ADDR_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;

function hasBase58Address(s: string): boolean {
  for (const m of s.matchAll(new RegExp(BASE58_ADDR_RE, "g"))) {
    if (/\d/.test(m[0]) && /[a-z]/.test(m[0]) && /[A-Z]/.test(m[0])) return true;
  }
  return false;
}

function isPrintable(s: string): boolean {
  if (s.length < 6) return false;
  let printable = 0;
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if ((c >= 32 && c < 127) || ch === "\n") printable++;
  }
  return printable / s.length > 0.9;
}

export function decodeMorse(seq: string): string {
  return seq
    .trim()
    .split(/\s*\/\s*|\s{3,}/)
    .map((word) =>
      word
        .trim()
        .split(/\s+/)
        .map((c) => MORSE[c] ?? "")
        .join(""),
    )
    .join(" ")
    .trim();
}

function findMorse(text: string): string[] {
  // En az 8 sembolden oluşan nokta/tire dizileri (ayraç: boşluk veya /)
  const re = /(?:[.\-·−–—]{1,7}(?:\s+|\s*\/\s*)){7,}[.\-·−–—]{1,7}/g;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const normalized = m[0].replace(/[·]/g, ".").replace(/[−–—]/g, "-");
    const decoded = decodeMorse(normalized);
    if (decoded.replace(/\s/g, "").length >= 4) out.push(decoded);
  }
  return out;
}

function findBase64(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b[A-Za-z0-9+/]{24,}={0,2}/g)) {
    try {
      const decoded = Buffer.from(m[0], "base64").toString("utf8");
      if (isPrintable(decoded)) out.push(decoded);
    } catch {
      /* geçersiz base64: yok say */
    }
  }
  return out;
}

function findHexText(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(?:0x)?([0-9a-fA-F]{24,})\b/g)) {
    const hex = m[1]!;
    if (hex.length === 40 || hex.length % 2 !== 0) continue; // EVM adresi veya tek uzunluk
    const decoded = Buffer.from(hex, "hex").toString("utf8");
    if (isPrintable(decoded)) out.push(decoded);
  }
  return out;
}

/** Unicode "tag" karakterleri (U+E0020–E007E) görünmez ASCII taşır; çözülür. */
function decodeUnicodeTags(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0xe0020 && cp <= 0xe007e) out += String.fromCharCode(cp - 0xe0000);
  }
  return out;
}

function safeFromCodePoint(cp: number): string {
  return Number.isInteger(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
}

export function htmlToText(html: string): { text: string; hiddenText: string[] } {
  const hiddenText: string[] = [];
  // Gizli stil taşıyan elemanların içeriğini ayrıca yakala
  const hiddenElRe = /<([a-z0-9]+)\b[^>]*(style\s*=\s*["'][^"']*["']|aria-hidden\s*=\s*["']true["']|hidden\b)[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(hiddenElRe)) {
    const attrs = m[0].slice(0, m[0].indexOf(">") + 1);
    if (HIDDEN_CSS_RE.test(attrs) || /\bhidden\b/i.test(attrs)) {
      hiddenText.push(m[3]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    }
  }
  if (/<style[\s\S]*?>[\s\S]*?(display\s*:\s*none|visibility\s*:\s*hidden)[\s\S]*?<\/style>/i.test(html)) {
    hiddenText.push("(stil sayfasında gizleme kuralı)");
  }
  const text = html
    .replace(/<(script|style|noscript|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " $1 ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h: string) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});/g, (_, d: string) => safeFromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return { text, hiddenText: hiddenText.filter(Boolean) };
}

export function sanitize(input: string, opts: { isHtml?: boolean } = {}): SanitizeResult {
  const flags = new Set<SanitizeFlag>();
  const decoded: SanitizeResult["decoded"] = [];

  let text = input;
  if (opts.isHtml) {
    const { text: plain, hiddenText } = htmlToText(input);
    text = plain;
    if (hiddenText.length) {
      flags.add("HIDDEN_TEXT");
      for (const h of hiddenText) decoded.push({ kind: "HIDDEN_TEXT", text: h });
    }
  }

  const tagPayload = decodeUnicodeTags(text);
  if (tagPayload) {
    flags.add("UNICODE_TAGS");
    decoded.push({ kind: "UNICODE_TAGS", text: tagPayload });
  }
  if (ZERO_WIDTH_RE.test(text) || UNICODE_TAG_RE.test(text)) flags.add("INVISIBLE_CHARS");
  text = text.replace(ZERO_WIDTH_RE, "").replace(UNICODE_TAG_RE, "").normalize("NFKC");

  for (const m of findMorse(text)) {
    flags.add("MORSE");
    decoded.push({ kind: "MORSE", text: m });
  }
  for (const b of findBase64(text)) {
    flags.add("BASE64");
    decoded.push({ kind: "BASE64", text: b });
  }
  for (const h of findHexText(text)) {
    flags.add("HEX_TEXT");
    decoded.push({ kind: "HEX_TEXT", text: h });
  }

  const corpus = [text, ...decoded.map((d) => d.text)];
  if (corpus.some((c) => INSTRUCTION_PATTERNS.some((re) => re.test(c)))) flags.add("INSTRUCTION");
  if (corpus.some((c) => EVM_ADDRESS_RE.test(c) || hasBase58Address(c))) flags.add("ADDRESS");

  return { text: text.slice(0, MAX_TEXT), flags: [...flags], decoded };
}

/** Sohbette meşru kullanımı olmayan gizleme bayrakları: bunlardan biri varsa mesaj ajana hiç gitmez. */
export const CHAT_BLOCK_FLAGS: readonly SanitizeFlag[] = ["UNICODE_TAGS", "MORSE", "BASE64", "HEX_TEXT"];

export interface ChatInputResult {
  /** Ajana gidecek metin: görünmez karakterler silinmiş, adresler maskelenmiş. */
  text: string;
  flags: SanitizeFlag[];
  /** Gizleme bayraklarından biri varsa true; mesaj LLM'e gönderilmez. */
  blocked: boolean;
  decoded: SanitizeResult["decoded"];
}

/**
 * Kullanıcının sohbet girdisi (yapıştırılmış sayfa metni dahil). Kullanıcı güvenilir, yapıştırdığı içerik değil:
 * görünmez karakterler silinir, adresler maskelenir, kodlanmış içerik (Mors/base64/hex/unicode tag) varsa mesaj durdurulur.
 * Talimat kalıpları burada engel değildir ("şunu gönder" kullanıcının meşru isteği olabilir); işlemi guardian kuralları durdurur.
 */
export function sanitizeChatInput(input: string): ChatInputResult {
  const s = sanitize(input);
  const blocked = s.flags.some((f) => CHAT_BLOCK_FLAGS.includes(f));
  let text = s.text.replace(new RegExp(EVM_ADDRESS_RE, "g"), "[adres gizlendi]");
  text = text.replace(new RegExp(BASE58_ADDR_RE, "g"), (m) => (hasBase58Address(m) ? "[adres gizlendi]" : m));
  return { text, flags: s.flags, blocked, decoded: s.decoded };
}

/**
 * Güvenilmeyen içerikte (web, haber) metni LLM'e hiç göndermeyen bayraklar. Gizli öğe metni `text` içinde kalır,
 * bu yüzden HIDDEN_TEXT de engeldir. Kalan bayraklar (görünmez karakter silindi, adres maskelendi) bilgi amaçlıdır.
 */
export const CONTENT_BLOCK_FLAGS: readonly SanitizeFlag[] = ["HIDDEN_TEXT", "INSTRUCTION", ...CHAT_BLOCK_FLAGS];

export interface InspectedContent {
  /** true: metin LLM'e gider; false: sadece bayraklar ve neden gider. */
  delivered: boolean;
  text?: string;
  flags: SanitizeFlag[];
  decoded: SanitizeResult["decoded"];
}

/** ATK uyumlu kapının "sanitized" görünümü (docs/compat.md): ham içerik taranır, temizse arındırılmış hali, değilse hiçbiri gider. */
export function inspectUntrusted(input: string, opts: { isHtml?: boolean } = {}): InspectedContent {
  const s = sanitize(input, opts);
  if (s.flags.some((f) => CONTENT_BLOCK_FLAGS.includes(f))) return { delivered: false, flags: s.flags, decoded: s.decoded };
  let text = s.text.replace(new RegExp(EVM_ADDRESS_RE, "g"), "[adres gizlendi]");
  text = text.replace(new RegExp(BASE58_ADDR_RE, "g"), (m) => (hasBase58Address(m) ? "[adres gizlendi]" : m));
  return { delivered: true, text, flags: s.flags, decoded: s.decoded };
}
