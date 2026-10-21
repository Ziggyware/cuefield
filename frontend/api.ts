import type { Upgrades } from "../shared/upgrades.ts";

const KEY = "cuefield.token";

function load(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

let token = load();

export const hasToken = () => !!token;

export function setToken(t: string | null): void {
  token = t;
  try {
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: session-only token */
  }
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(String((data as { error?: string }).error ?? res.status), res.status);
  return data as T;
}

export interface Profile {
  id: string;
  name: string;
  coins: number;
  rating: number;
  wins: number;
  losses: number;
  cue: string;
  cues: string[];
  unlocks: string[];
  account: "valtown" | "guest";
  daily: number;
  streak: number;
  upgrades: Upgrades;
  earned: number;
  progression: ReturnType<typeof import("../shared/rewards.ts").progression>;
  winStreak: number;
  bestStreak: number;
  botWins: number;
  botLosses: number;
}

export interface MatchResult {
  kind: "online" | "bot";
  mode: number;
  table: string;
  ended: number;
  reason: string | null;
  pot: number;
  winner: string;
  loser: string;
  won?: boolean;
}

export interface GlobalStats {
  players: number;
  live: number;
  queued: number;
  today: { online: number; bot: number; paid: number };
  venues: { id: string; plays: number; paid: number }[];
  top: { name: string; rating: number; wins: number; losses: number }[];
  streak: { name: string; n: number } | null;
  recent: MatchResult[];
}

export interface PlayerStats {
  rank: number | null;
  of: number;
  winPct: number | null;
  venues: { id: string; w: number; l: number }[];
  recent: MatchResult[];
}
