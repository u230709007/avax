export interface AuditRow {
  seq: number;
  ts: number;
  source: string;
  tool: string;
  input: unknown;
  outcome: "ALLOWED" | "REJECTED" | "PENDING_APPROVAL" | "WARNING" | "OK" | "ERROR";
  code: string | null;
  detail: unknown;
  prevHash: string;
  hash: string;
}

export interface ChainSnapshot {
  reachable: boolean;
  policyHashMatches: boolean;
  paused: boolean;
  onchainHash?: string;
  onchainVersion?: number;
  localHash: string;
  checkedAt: number;
  error?: string;
  policyRegistry?: string;
  auditAnchor?: string;
  explorer?: string;
}

export interface LlmOption {
  id: string;
  label: string;
  available: boolean;
  active: boolean;
}

export interface Status {
  okx: { connected: boolean; demo: boolean; error?: string; missingTools: string[] };
  chain: ChainSnapshot;
  anchorer: { lastError?: string };
  chatEnabled: boolean;
  agent: string | null;
  llm: LlmOption[];
  autonomous: { enabled: boolean; intervalSeconds: number } | null;
  tools: string[];
}

export interface Snapshot {
  ts: number;
  totalEqUsd: number;
  holdings: { ccy: string; eq: number; avail: number; eqUsd: number }[];
  positions: { posId: string; instId: string; pos: string; avgPx: string; upl: string; lever: string; mgnMode: string }[];
  dayStartEqUsd: number;
  dailyPnlPct: number;
}

export interface Portfolio {
  snapshot: Snapshot;
  volume24h: number;
  limit24h: number;
}

export interface Anchor {
  id: number;
  ts: number;
  fromSeq: number;
  toSeq: number;
  root: string;
  txHash: string | null;
}

export interface Approval {
  id: string;
  created: number;
  expires: number;
  status: string;
  summary: {
    instId: string;
    market: string;
    side: string;
    notionalUsdt: number;
    leverage: number;
    slPct?: number;
    tpPct?: number;
    rules: { rule: string; ok: boolean; detail?: string }[];
  };
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "system";
  display: string;
  raw?: string;
  ts: number;
  traffic?: { direction: "to_llm" | "from_llm"; tool?: string; payload: unknown; ts: number }[];
}
