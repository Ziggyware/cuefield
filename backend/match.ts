import { type AssistLevel, clampAssist, cueById, type CueSpec, type Mode, rulesOf, tableById } from "../shared/catalog.ts";
import { effectiveCue } from "../shared/upgrades.ts";
import { newGame } from "../shared/game/engine.ts";
import type { GameState } from "../shared/game/types.ts";
import { randomId } from "./auth.ts";
import { one, q, type Row } from "./db.ts";

/** Connection setup grace before the first shot clock starts. */
export const OPEN_GRACE_MS = 20_000;
/** Correspondence matches: a day per shot, no disconnect forfeit. */
export const CORR_CLOCK_MS = 86_400_000;

export interface Match {
  id: string;
  mode: Mode;
  table: string;
  p: [string, string];
  cue: [CueSpec, CueSpec];
  stake: number;
  /** Host-chosen prediction level for private rooms; null = venue default. */
  assist: AssistLevel | null;
  ranked: boolean;
  /** Per-shot clock override (correspondence); null = venue clock. */
  clock: number | null;
  state: GameState;
  log: unknown[];
  version: number;
  deadline: number;
  seen: [number, number];
  status: "live" | "done";
  winner: number;
  reason: string | null;
  rematch: [boolean, boolean];
  next: string | null;
  created: number;
}

/** Matches store the effective (upgraded) cue as JSON; legacy rows hold a bare cue id. */
export const parseCue = (s: string): CueSpec => (s.startsWith("{") ? JSON.parse(s) : cueById(s));

export function toMatch(r: Row): Match {
  return {
    id: String(r.id),
    mode: Number(r.mode) as Mode,
    table: String(r.table_id),
    p: [String(r.p0), String(r.p1)],
    cue: [parseCue(String(r.cue0)), parseCue(String(r.cue1))],
    stake: Number(r.stake),
    ranked: Number(r.ranked) === 1,
    clock: r.clock == null ? null : Number(r.clock),
    assist: r.assist == null ? null : clampAssist(r.assist),
    state: JSON.parse(String(r.state)),
    log: JSON.parse(String(r.log)),
    version: Number(r.version),
    deadline: Number(r.deadline),
    seen: [Number(r.seen0), Number(r.seen1)],
    status: r.status === "done" ? "done" : "live",
    winner: Number(r.winner),
    reason: r.reason == null ? null : String(r.reason),
    rematch: [Number(r.rematch0) === 1, Number(r.rematch1) === 1],
    next: r.next_id == null ? null : String(r.next_id),
    created: Number(r.created),
  };
}

export async function loadMatch(id: string): Promise<Match | undefined> {
  const r = await one(`SELECT * FROM matches WHERE id = ?`, [id]);
  return r && toMatch(r);
}

/** Shot clock in force for this match. */
export const clockOf = (m: Match): number => m.clock ?? rulesOf(m.table).clock;

export const seatOf = (m: Match, pid: string): 0 | 1 | -1 => (m.p[0] === pid ? 0 : m.p[1] === pid ? 1 : -1);

/** Escrows the table fee from both players in one statement; fails without side effects if either is short. */
export async function createMatch(
  a: string,
  b: string,
  mode: Mode,
  table: string,
  ranked: boolean,
  id = randomId(10),
  opts: { assist?: AssistLevel | null; clock?: number | null } = {},
): Promise<string | null> {
  const spec = tableById(table);
  if (!spec || a === b) return null;
  const fee = spec.fee;
  if (fee > 0) {
    const paid = await q(
      `UPDATE players SET coins = coins - ? WHERE id IN (?, ?) AND (SELECT COUNT(*) FROM players WHERE id IN (?, ?) AND coins >= ?) = 2 RETURNING id`,
      [fee, a, b, a, b, fee],
    );
    if (paid.length !== 2) return null;
  }
  const cues = await q(`SELECT id, cue, upgrades FROM players WHERE id IN (?, ?)`, [a, b]);
  const cueOf = (pid: string) => {
    const r = cues.find((x) => x.id === pid);
    return JSON.stringify(effectiveCue(cueById(String(r?.cue ?? "")), JSON.parse(String(r?.upgrades ?? "{}"))));
  };
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  const breaker = (seed & 1) as 0 | 1;
  const state = newGame(mode, table, seed >>> 1, breaker);
  const now = Date.now(), clock = opts.clock ?? null;
  await q(
    `INSERT INTO matches (id, mode, table_id, p0, p1, cue0, cue1, stake, ranked, assist, clock, state, init, log, version, deadline, seen0, seen1, status, created)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,'live',?)`,
    [
      id,
      mode,
      table,
      a,
      b,
      cueOf(a),
      cueOf(b),
      fee,
      ranked ? 1 : 0,
      opts.assist ?? null,
      clock,
      JSON.stringify(state),
      JSON.stringify(state),
      "[]",
      now + OPEN_GRACE_MS + (clock ?? rulesOf(table).clock),
      now,
      now,
      now,
    ],
  );
  return id;
}
