import { CUES, START_COINS, START_RATING } from "../shared/catalog.ts";
import type { Upgrades } from "../shared/upgrades.ts";
import { one, q, type Row } from "./db.ts";

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function sha256(s: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
}

export function randomId(bytes = 16): string {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  // deno-lint-ignore no-control-regex
  const n = raw.normalize("NFKC").replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 20);
  return n.length >= 2 ? n : null;
}

export async function createGuest(name: string): Promise<{ token: string; id: string }> {
  const id = randomId(8);
  const token = randomId(32);
  const freeCue = CUES.filter((c) => c.price === 0).map((c) => c.id);
  await q(
    `INSERT INTO players (id, token_hash, name, coins, rating, cue, cues, tables, unlocks, created) VALUES (?,?,?,?,?,?,?,'[]',?,?)`,
    [id, await sha256(token), name, START_COINS, START_RATING, freeCue[0], JSON.stringify(freeCue), JSON.stringify(["basic"]), Date.now()],
  );
  return { token, id };
}

export interface Player {
  id: string;
  name: string;
  coins: number;
  rating: number;
  wins: number;
  losses: number;
  cue: string;
  cues: string[];
  daily_at: number;
  streak: number;
  upgrades: Upgrades;
  solo_day: number;
  solo_earned: number;
  unlocks: string[];
  earned: number;
  win_streak: number;
  best_streak: number;
  bot_wins: number;
  bot_losses: number;
  /** Val Town user id when the account is bound to a Val Town login. */
  vt_id: string | null;
}

export function toPlayer(r: Row): Player {
  return {
    id: String(r.id),
    name: String(r.name),
    coins: Number(r.coins),
    rating: Number(r.rating),
    wins: Number(r.wins),
    losses: Number(r.losses),
    cue: String(r.cue),
    cues: JSON.parse(String(r.cues)),
    daily_at: Number(r.daily_at),
    streak: Number(r.streak),
    upgrades: JSON.parse(String(r.upgrades ?? "{}")),
    solo_day: Number(r.solo_day ?? 0),
    solo_earned: Number(r.solo_earned ?? 0),
    unlocks: JSON.parse(String(r.unlocks ?? '["basic"]')),
    earned: Number(r.earned ?? 0),
    win_streak: Number(r.win_streak ?? 0),
    best_streak: Number(r.best_streak ?? 0),
    bot_wins: Number(r.bot_wins ?? 0),
    bot_losses: Number(r.bot_losses ?? 0),
    vt_id: r.vt_id == null ? null : String(r.vt_id),
  };
}

export async function playerById(id: string): Promise<Player | undefined> {
  const r = await one(`SELECT * FROM players WHERE id = ?`, [id]);
  return r && toPlayer(r);
}
