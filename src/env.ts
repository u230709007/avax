// docs: docs/runbook.md
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

/** Okunan .env dosyasının yolu (yoksa undefined). */
export const ENV_PATH = existsSync(resolve(".env")) ? resolve(".env") : undefined;

/**
 * .env tek doğruluk kaynağıdır: sistemde/terminalde aynı adla kalmış eski bir değişken
 * (ör. LLM_PROVIDER=gemini) .env'deki değeri ezmesin diye override açık.
 */
const shadowed = ENV_PATH ? Object.keys(config({ path: ENV_PATH, override: false, quiet: true, processEnv: {} }).parsed ?? {}) : [];
const before = Object.fromEntries(shadowed.map((k) => [k, process.env[k]]));
if (ENV_PATH) config({ path: ENV_PATH, override: true, quiet: true });

/** .env'deki değerin sistemdeki farklı bir değeri ezdiği anahtarlar (açılışta uyarı için; değer yazılmaz). */
export const OVERRIDDEN_KEYS = shadowed.filter((k) => before[k] !== undefined && before[k] !== process.env[k]);
