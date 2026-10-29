import type { CueSpec } from "../catalog.ts";
import { R } from "../physics/constants.ts";
import { geometry } from "./engine.ts";
import { needsCall } from "./rules.ts";
import type { GameState, StrikeCmd } from "./types.ts";

export function placeError(st: GameState, x: number, y: number): string | null {
  const g = geometry(st.table);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return "place";
  if (Math.abs(x) > g.L / 2 - R || Math.abs(y) > g.W / 2 - R) return "bounds";
  if (st.bih === 1 && x > -g.L / 4) return "kitchen";
  for (const b of st.balls) if (b.on && b.id !== 0 && (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) < 4 * R * R) return "overlap";
  return null;
}

export const mustCall = (st: GameState): boolean => needsCall(st);

export function validate(st: GameState, c: StrikeCmd, cue: CueSpec): string | null {
  if (st.winner >= 0) return "over";
  for (const k of ["dx", "dy", "power", "tx", "ty", "el"] as const) if (!Number.isSafeInteger(c[k])) return k;
  if (c.finesse !== undefined && (!Number.isInteger(c.finesse) || c.finesse < 0 || c.finesse > 1000)) return "finesse";
  for (const k of ["tipChalk", "handChalk"] as const) {
    const v = c[k];
    if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1)) return "chalk";
  }
  if (c.dx === 0 && c.dy === 0) return "aim";
  if (c.el > cue.elev || c.el < 0) return "elevation";
  if (c.place) {
    if (st.bih === 0) return "no-bih";
    const e = placeError(st, c.place[0], c.place[1]);
    if (e) return e;
  }
  if (mustCall(st) && !(Number.isInteger(c.call) && c.call! >= 0 && c.call! < 6)) return "call";
  return null;
}

/** FNV-1a over the IEEE-754 bytes of every ball position plus turn state. */
export function hash(st: GameState): string {
  const dv = new DataView(new ArrayBuffer(8));
  let h = 0x811c9dc5;
  const mix = (n: number) => {
    dv.setFloat64(0, n);
    for (let i = 0; i < 8; i++) h = Math.imul(h ^ dv.getUint8(i), 16777619) >>> 0;
  };
  for (const b of st.balls) {
    mix(b.on ? b.x : 9);
    mix(b.on ? b.y : 9);
  }
  mix(st.turn);
  mix(st.bih);
  mix(st.winner);
  mix(st.groups[0]);
  mix(st.shot);
  mix(st.score?.[0] ?? 0);
  mix(st.score?.[1] ?? 0);
  return h.toString(16).padStart(8, "0");
}
