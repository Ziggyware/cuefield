import type { AssistLevel, CueSpec } from "../shared/catalog.ts";
import { begin } from "../shared/game/engine.ts";
import type { GameState, StrikeCmd } from "../shared/game/types.ts";
import { prefs } from "./prefs/store.ts";

/**
 * Guide extent by level. reach scales the cue's guide length (m) for continuations; pre caps the cue-ball path before
 * first contact (∞ = to contact); obj: object-ball continuation; all: every disturbed ball to rest.
 */
const LEVELS: Record<AssistLevel, { reach: number; pre: number; obj: boolean; cueOn: boolean; all: boolean }> = {
  1: { reach: 0, pre: 0, obj: false, cueOn: false, all: false },
  2: { reach: 2.2, pre: Infinity, obj: false, cueOn: true, all: false },
  3: { reach: 2.2, pre: Infinity, obj: true, cueOn: true, all: false },
  4: { reach: Infinity, pre: Infinity, obj: true, cueOn: true, all: true },
};

export interface Preview {
  ghost: [number, number] | null;
  target: number;
  /** Path per moving ball, cue ball first; `rest` marks a path traced to its stopping point. */
  paths: { id: number; pts: [number, number][]; rest: boolean }[];
  /** Pockets a traced object ball is predicted to drop into. */
  pots: number[];
}

/**
 * Runs the real simulator on the intended stroke (no stroke wobble): spin, squirt, swerve, throw and cushion english
 * are exact. Level 2 draws the cue ball through and after contact; 3 adds the first object ball; 4 traces every ball to rest. 1 shows nothing.
 */
export function preview(st: GameState, cmd: StrikeCmd, cue: CueSpec, level: AssistLevel): Preview | null {
  if (level <= 1) return null;
  const A = LEVELS[level];
  const sim = begin(st, cmd, cue, true);
  const B = sim.balls, cb = B[0];
  const out: Preview = { ghost: null, target: -1, paths: [], pots: [] };
  const k = prefs.guideReach, every = Math.max(1, 13 - Math.round(prefs.guidePrecision));
  const allCap = k >= 1 ? Infinity : 8 * k;
  const trace = new Map<number, { pts: [number, number][]; len: number; cap: number }>();
  const budget = cue.guide * A.reach * k;
  trace.set(0, { pts: [[cb.x, cb.y]], len: 0, cap: cue.guide * A.pre * k });
  let contact = false, reach = true;
  for (let step = 0; step < 9000 && !sim.done; step++) {
    const ne = sim.events.length;
    sim.step();
    for (let i = ne; i < sim.events.length; i++) {
      const e = sim.events[i];
      if (e.k === "pocket") {
        if (e.a !== 0 && trace.has(e.a)) out.pots.push(e.p);
        continue;
      }
      if (!contact && (e.k === "rail" ? e.a === 0 : e.a === 0 || e.b === 0)) {
        contact = true;
        const t0 = trace.get(0)!, last = t0.pts[t0.pts.length - 1];
        if (t0.len < t0.cap) {
          t0.len += Math.hypot(cb.x - last[0], cb.y - last[1]);
          t0.pts.push([cb.x, cb.y]);
        }
        reach = t0.len <= t0.cap;
        t0.cap = A.all ? allCap : A.cueOn ? t0.len + budget * (e.k === "ball" ? 0.6 : 1) : t0.len;
      }
      if (e.k === "ball" && reach && out.target < 0 && (e.a === 0 || e.b === 0)) {
        out.target = e.a === 0 ? e.b : e.a;
        out.ghost = [cb.x, cb.y];
      }
      if (e.k === "ball") {
        for (const id of [e.a, e.b]) {
          if (trace.has(id)) continue;
          if (!A.all && (id !== out.target || !A.obj)) continue;
          trace.set(id, { pts: [[B[id].x, B[id].y]], len: 0, cap: A.all ? allCap : budget * 0.8 });
        }
      }
    }
    if (step % every && !sim.done) continue;
    let open = false;
    for (const [id, t] of trace) {
      const b = B[id], last = t.pts[t.pts.length - 1];
      if (t.len >= t.cap) continue;
      if (b.on) {
        const d = Math.hypot(b.x - last[0], b.y - last[1]);
        if (d > 1e-4) {
          t.len += d;
          t.pts.push([b.x, b.y]);
        }
      }
      if (b.on && t.len < t.cap) open = true;
    }
    if (!open && (contact || !A.obj)) break;
  }
  for (const [id, t] of trace) out.paths.push({ id, pts: t.pts, rest: sim.done && B[id].on });
  return out;
}
