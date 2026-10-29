import type { AssistLevel, CueSpec } from "../shared/catalog.ts";
import { begin } from "../shared/game/engine.ts";
import type { GameState, StrikeCmd } from "../shared/game/types.ts";
import { DT, MAX_SIM_TIME } from "../shared/physics/constants.ts";
import type { Ball } from "../shared/physics/types.ts";

const LEVELS: Record<AssistLevel, { reach: number; pre: number; obj: boolean; cueOn: boolean; all: boolean }> = {
  1: { reach: 0, pre: 0, obj: false, cueOn: false, all: false },
  2: { reach: 2.2, pre: Infinity, obj: false, cueOn: true, all: false },
  3: { reach: 2.2, pre: Infinity, obj: true, cueOn: true, all: false },
  4: { reach: Infinity, pre: Infinity, obj: true, cueOn: true, all: true },
};

export interface Preview {
  ghost: [number, number] | null;
  target: number;
  paths: { id: number; pts: [number, number][]; rest: boolean }[];
  pots: number[];
}
export interface PreviewOptions { guideReach: number; guidePrecision: number }
interface Trace { pts: [number, number][]; len: number; cap: number; x: number; y: number }

/** Keep contact corners while collapsing almost-straight samples into compact polylines. */
function add(t: Trace, x: number, y: number, force = false): void {
  let dx = x - t.x, dy = y - t.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9 || t.len >= t.cap) return;
  if (t.len + d > t.cap) {
    const k = (t.cap - t.len) / d;
    dx *= k; dy *= k; x = t.x + dx; y = t.y + dy;
  }
  t.len += Math.hypot(dx, dy);
  t.x = x; t.y = y;
  const n = t.pts.length;
  if (!force && n >= 2) {
    const a = t.pts[n - 2], b = t.pts[n - 1];
    const ax = x - a[0], ay = y - a[1], bx = b[0] - a[0], by = b[1] - a[1];
    const length = Math.hypot(ax, ay);
    const deviation = length ? Math.abs(ax * by - ay * bx) / length : 0;
    if (length <= 0.06 && deviation < 0.0003 && ax * bx + ay * by >= 0) {
      b[0] = x; b[1] = y;
      return;
    }
  }
  t.pts.push([x, y]);
}

/** The same seeded strike and lip allowance as the actual shot, traced through its full fixed-step simulation. */
export function preview(st: GameState, cmd: StrikeCmd, cue: CueSpec, level: AssistLevel, options: PreviewOptions = { guideReach: 1, guidePrecision: 12 }): Preview | null {
  if (level <= 1) return null;
  const A = LEVELS[level], sim = begin(st, cmd, cue);
  const byId: (Ball | undefined)[] = [];
  for (const b of sim.balls) byId[b.id] = b;
  const cb = byId[0]!;
  const out: Preview = { ghost: null, target: -1, paths: [], pots: [] };
  const k = Math.max(0.25, Math.min(1, options.guideReach));
  const every = Math.max(1, 13 - Math.round(Math.max(1, Math.min(12, options.guidePrecision))));
  const allCap = k >= 1 ? Infinity : 8 * k;
  const trace = new Map<number, Trace>();
  const budget = cue.guide * A.reach * k;
  trace.set(0, { pts: [[cb.x, cb.y]], x: cb.x, y: cb.y, len: 0, cap: cue.guide * A.pre * k });
  let contact = false, reach = true;
  const maxSteps = Math.ceil(MAX_SIM_TIME / DT) + 2;
  for (let step = 0; step < maxSteps && !sim.done; step++) {
    const ne = sim.events.length;
    sim.step();
    for (let i = ne; i < sim.events.length; i++) {
      const e = sim.events[i];
      if (e.k === "pocket") {
        const t = trace.get(e.a), b = byId[e.a];
        if (t && b) add(t, b.x, b.y, true);
        if (e.a !== 0 && t) out.pots.push(e.p);
        continue;
      }
      if (!contact && (e.k === "ball" ? e.a === 0 || e.b === 0 : (e.k === "rail" || e.k === "jaw") && e.a === 0)) {
        contact = true;
        const t0 = trace.get(0)!;
        add(t0, cb.x, cb.y, true);
        reach = t0.len <= t0.cap;
        t0.cap = A.all ? allCap : A.cueOn ? t0.len + budget * (e.k === "ball" ? 0.6 : 1) : t0.len;
      }
      if (e.k === "ball" && reach && out.target < 0 && (e.a === 0 || e.b === 0)) {
        out.target = e.a === 0 ? e.b : e.a;
        out.ghost = [cb.x, cb.y];
      }
      if (e.k === "ball") {
        for (const id of [e.a, e.b]) {
          const b = byId[id];
          if (!b) continue;
          const existing = trace.get(id);
          if (existing) { add(existing, b.x, b.y, true); continue; }
          if (!A.all && (id !== out.target || !A.obj)) continue;
          trace.set(id, { pts: [[b.x, b.y]], x: b.x, y: b.y, len: 0, cap: A.all ? allCap : budget * 0.8 });
        }
      } else if (e.k === "rail" || e.k === "jaw" || e.k === "off") {
        const t = trace.get(e.a), b = byId[e.a];
        if (t && b) add(t, b.x, b.y, true);
      }
    }
    if (step % every && !sim.done) continue;
    let open = false;
    for (const [id, t] of trace) {
      const b = byId[id];
      if (!b || t.len >= t.cap) continue;
      add(t, b.x, b.y);
      if (b.on && t.len < t.cap) open = true;
    }
    if (!open && (contact || !A.obj)) break;
  }
  for (const [id, t] of trace) out.paths.push({ id, pts: t.pts, rest: sim.done && !!byId[id]?.on });
  return out;
}
