/** Guardian API istemcisi. Token URL'den (?token=) bir kez alınır, sessionStorage'da tutulur. */
const KEY = "guardian-token";

export function getToken(): string | null {
  const fromUrl = new URLSearchParams(location.search).get("token");
  if (fromUrl) {
    try {
      sessionStorage.setItem(KEY, fromUrl);
    } catch {
      /* depolama kapalı: sadece bu oturum */
    }
    history.replaceState(null, "", location.pathname);
    return fromUrl;
  }
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(t: string) {
  try {
    sessionStorage.setItem(KEY, t);
  } catch {
    /* yok say */
  }
}

let token = getToken();
export const hasToken = () => Boolean(token);
export const useToken = (t: string) => {
  token = t;
  setToken(t);
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? "GET",
    headers: { "x-ui-token": token ?? "", ...(init?.body !== undefined ? { "content-type": "application/json" } : {}) },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export type WsEvent = { type: string; data: unknown };

export function connectWs(onEvent: (e: WsEvent) => void, onStatus: (open: boolean) => void): () => void {
  let ws: WebSocket | undefined;
  let closed = false;
  let retry: number | undefined;
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token ?? "")}`);
    ws.onopen = () => onStatus(true);
    ws.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data as string) as WsEvent);
      } catch {
        /* bozuk mesaj */
      }
    };
    ws.onclose = () => {
      onStatus(false);
      if (!closed) retry = window.setTimeout(open, 2000);
    };
  };
  open();
  return () => {
    closed = true;
    if (retry) clearTimeout(retry);
    ws?.close();
  };
}
