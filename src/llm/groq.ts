// docs: docs/llm.md
/**
 * Groq (OpenAI uyumlu Chat Completions). SDK yok, düz fetch: tek uç, az bağımlılık.
 * Varsayılan modeller tool çağırma ve JSON şema çıktısını destekleyen gpt-oss ailesidir; .env ile değiştirilebilir.
 */
export const GROQ_BASE_URL = () => process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";
export const GROQ_DECISION_MODEL = () => process.env.GROQ_MODEL ?? "openai/gpt-oss-120b";
export const GROQ_QUARANTINE_MODEL = () => process.env.GROQ_QUARANTINE_MODEL ?? "openai/gpt-oss-20b";
/** Karar modelinin kotası dolunca (429) denenecek model; kota model başınadır. Boş = yedek yok. */
export const GROQ_FALLBACK_MODEL = () => process.env.GROQ_FALLBACK_MODEL ?? "openai/gpt-oss-20b";

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: { type: "function"; function: { name: string; description: string; parameters: unknown } }[];
  response_format?: unknown;
  temperature?: number;
  max_completion_tokens?: number;
}

export interface ChatResponse {
  choices: { message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }; finish_reason: string }[];
}

export class GroqError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryMs?: number,
  ) {
    super(message);
  }
}

export async function groqChat(req: ChatRequest): Promise<ChatResponse> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY tanımlı değil (.env)");
  const res = await fetch(`${GROQ_BASE_URL()}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      message = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? body;
    } catch {
      /* gövde JSON değil */
    }
    const retry = Number(res.headers.get("retry-after"));
    throw new GroqError(res.status, message, Number.isFinite(retry) && retry > 0 ? retry * 1000 : undefined);
  }
  return (await res.json()) as ChatResponse;
}

export interface GroqFailure {
  status?: number;
  /** 429 ise: günlük (TPD/RPD) mi dakikalık (TPM/RPM) mı. */
  quota?: "daily" | "minute";
  retryMs?: number;
}

/** Groq 429 mesajı: "Rate limit reached for model ... on tokens per day (TPD): ... Please try again in 7m12.5s." */
export function classifyGroqError(e: unknown): GroqFailure {
  if (!(e instanceof GroqError)) return {};
  if (e.status !== 429) return { status: e.status };
  const m = /try again in (?:(\d+)h)?(?:(\d+)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?/.exec(e.message);
  const fromMsg = m && m[0] !== "try again in "
    ? ((Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0)) * 60 + Number(m[3] ?? 0)) * 1000 + Number(m[4] ?? 0)
    : undefined;
  return {
    status: 429,
    quota: /per day|\(TPD\)|\(RPD\)/i.test(e.message) ? "daily" : "minute",
    retryMs: e.retryMs ?? (fromMsg !== undefined ? Math.ceil(fromMsg) : undefined),
  };
}

/** Kullanıcıya gösterilecek kısa Türkçe açıklama; ham gövde arayüze gitmez. */
export function describeGroqError(e: unknown): string {
  const f = classifyGroqError(e);
  const wait = f.retryMs ? ` (yaklaşık ${humanWait(f.retryMs)} sonra)` : "";
  if (f.quota === "daily") return `Groq günlük kotası doldu${wait}. Otonom modu kapatmak kotayı korur; ya da GROQ_MODEL ile başka model seç.`;
  if (f.quota === "minute") return `Groq dakikalık sınırı aşıldı; biraz sonra tekrar dene${wait}.`;
  if (f.status === 401) return "Groq anahtarı geçersiz (GROQ_API_KEY).";
  if (f.status === 400 && e instanceof GroqError && /tool/i.test(e.message)) return "Model geçersiz bir tool çağrısı üretti; mesajı tekrar gönder.";
  if (f.status && f.status >= 500) return `Groq geçici olarak yanıt vermiyor (HTTP ${f.status}); biraz sonra tekrar dene.`;
  if ((e as Error).name === "TimeoutError") return "Groq 60 sn içinde yanıt vermedi.";
  return `Groq hatası: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]?.slice(0, 200) ?? ""}`;
}

function humanWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return s < 120 ? `${s} sn` : `${Math.ceil(s / 60)} dk`;
}

/** Dakikalık 429 ve 5xx için bekleyip tekrar dener (en fazla 30 sn); günlük kotada hemen atar. */
export async function groqWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const f = classifyGroqError(e);
      const transient = f.quota === "minute" || (f.status !== undefined && f.status >= 500);
      const wait = f.retryMs ?? 2000 * 2 ** i;
      if (!transient || i >= attempts - 1 || wait > 30_000) throw e;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/** Önce birincil modeli dener; 429 ise yedek modele geçer. */
export async function groqWithFallback<T>(primary: string, fallback: string, fn: (model: string) => Promise<T>): Promise<T> {
  try {
    return await groqWithRetry(() => fn(primary));
  } catch (e) {
    if (!fallback || fallback === primary || classifyGroqError(e).status !== 429) throw e;
    return groqWithRetry(() => fn(fallback));
  }
}
