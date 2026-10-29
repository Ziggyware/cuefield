import type { CueSpec, Mode } from "../catalog.ts";
import { newGame, play, type PhysicsVersion } from "./engine.ts";
import type { GameState, StrikeCmd } from "./types.ts";
import { validate } from "./validate.ts";

/** Daily Rack: one deterministic 9-ball rack per UTC day for everyone; fewest strokes plus fouls to win it. */
export const DAILY = { mode: 9 as Mode, table: "hall", maxStrokes: 60, reward: 40 };

export const dayOf = (ms: number) => Math.floor(ms / 86_400_000);

/** 32-bit avalanche of the day index (murmur3 finaliser), truncated to the 31-bit rack seed. */
export function dailySeed(day: number): number {
  let x = Math.imul(day, 0x9e3779b1) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 1;
}

export const dailyRack = (day: number, physics?: PhysicsVersion): GameState => newGame(DAILY.mode, DAILY.table, dailySeed(day), 0, physics);

/** All players on one UTC day use the same physics, including late submissions after midnight. */
export const dailyPhysics = (day: number, cutoverDay: number): PhysicsVersion => day < cutoverDay ? 1 : 2;

/** Solo continuation: every stroke is seat 0's, and fouls only cost a point (no three-foul loss). */
export function soloNext(st: GameState): GameState {
  if (st.winner >= 0) return st;
  return { ...st, turn: 0, fouls: [0, 0] };
}

export type DailyRun = { score: number; strokes: number; fouls: number } | { error: string };

/** Replays a submitted run from the day's rack; identical on client and server. */
export function scoreRun(day: number, log: unknown, cue: CueSpec, physics?: PhysicsVersion): DailyRun {
  if (!Array.isArray(log) || log.length === 0 || log.length > DAILY.maxStrokes) return { error: "log" };
  let st = dailyRack(day, physics), fouls = 0;
  for (const raw of log) {
    const cmd = raw as StrikeCmd;
    if (!cmd || cmd.k !== "strike" || st.winner >= 0) return { error: "log" };
    const err = validate(st, cmd, cue);
    if (err) return { error: err };
    st = play(st, cmd, cue).state;
    if (st.last?.foul) fouls++;
    if (st.winner === 1) return { error: "lost" };
    st = soloNext(st);
  }
  if (st.winner !== 0) return { error: "unfinished" };
  return { score: log.length + fouls, strokes: log.length, fouls };
}
