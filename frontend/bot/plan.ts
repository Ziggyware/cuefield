import { type CueSpec, tableById } from "../../shared/catalog.ts";
import { geometry, play } from "../../shared/game/engine.ts";
import { anyPlace, legalTargets, score } from "./eval.ts";
import type { GameState, StrikeCmd } from "../../shared/game/types.ts";
import { mustCall, placeError, validate } from "../../shared/game/validate.ts";
import { R } from "../../shared/physics/constants.ts";

export type Level = 0 | 1 | 2;
const NOISE = [0.022, 0.009, 0.0025];
const POWERS = [[0.42, 0.62], [0.32, 0.5, 0.72], [0.3, 0.48, 0.7]];
const LINES = [5, 9, 14];
const SPINS = [[0], [0, -0.6], [0, -0.7, 0.6]];

const cmdOf = (ang: number, power: number, ty: number, place?: [number, number], call?: number): StrikeCmd => ({
  k: "strike",
  dx: Math.round(Math.cos(ang) * 1e6),
  dy: Math.round(Math.sin(ang) * 1e6),
  power: Math.round(Math.pow(power, 1.5) * 1000),
  tx: 0,
  ty: Math.round(ty * 1000),
  el: 0,
  ...(place ? { place } : {}),
  ...(call !== undefined ? { call } : {}),
});

/** Ghost-ball candidates for every legal ball × pocket, each evaluated by full deterministic simulation. */
export function plan(st: GameState, cue: CueSpec, level: Level, rand: () => number): StrikeCmd {
  const geo = geometry(st.table);
  if (!st.broken) {
    const apex = st.balls.filter((b) => b.on && b.id > 0).reduce((a, b) => (b.x < a.x ? b : a));
    const cb = st.balls[0];
    const ang = Math.atan2(apex.y - cb.y, apex.x - cb.x) + (rand() - 0.5) * NOISE[level];
    return cmdOf(ang, 1, -0.15, [cb.x, cb.y]);
  }
  const bih = st.bih > 0;
  let best: { cmd: StrikeCmd; s: number } | null = null;
  const consider = (cmd: StrikeCmd) => {
    if (validate(st, cmd, cue)) return;
    const s = score(st, play(st, cmd, cue, true).state) + rand();
    if (!best || s > best.s) best = { cmd, s };
  };
  const call = mustCall(st);
  const lines: { ang: number; place?: [number, number]; k: number; q: number }[] = [];
  for (const id of legalTargets(st)) {
    const b = st.balls[id];
    geo.pockets.forEach((p, k) => {
      const px = p.x + p.dx * p.half * 0.3, py = p.y + p.dy * p.half * 0.3;
      const ux = px - b.x, uy = py - b.y, ul = Math.hypot(ux, uy);
      const gx = b.x - (ux / ul) * 2 * R, gy = b.y - (uy / ul) * 2 * R;
      let place: [number, number] | undefined;
      let cx = st.balls[0].x, cy = st.balls[0].y;
      if (bih) {
        const d = 0.18 + 0.12 * rand();
        const tx = gx - (ux / ul) * d, ty = gy - (uy / ul) * d;
        if (!placeError(st, tx, ty)) {
          place = [tx, ty];
          cx = tx;
          cy = ty;
        } else if (st.bih === 1) place = [cx, cy];
      }
      const ax = gx - cx, ay = gy - cy, al = Math.hypot(ax, ay);
      if ((ax * ux + ay * uy) / (al * ul) < 0.25) return;
      const q = (ax * ux + ay * uy) / (al * ul) - (ul + al) * 0.15;
      lines.push({ ang: Math.atan2(ay, ax), place, k, q });
    });
  }
  lines.sort((a, b) => b.q - a.q);
  const t0 = performance.now();
  for (const l of lines.slice(0, LINES[level])) {
    for (const pw of POWERS[level]) for (const sp of SPINS[level]) consider(cmdOf(l.ang, pw, sp, l.place, call ? l.k : undefined));
    if (performance.now() - t0 > 1800) break;
  }
  if (!best) {
    const spec = tableById(st.table)!;
    const at: [number, number] = bih ? anyPlace(st, spec.L, spec.W) : [st.balls[0].x, st.balls[0].y];
    const t = st.balls[legalTargets(st)[0] ?? 0] ?? st.balls[0];
    const ang = t.id === 0 ? 0 : Math.atan2(t.y - at[1], t.x - at[0]);
    return cmdOf(ang, 0.5, 0, bih ? at : undefined, call ? 0 : undefined);
  }
  const c = (best as { cmd: StrikeCmd }).cmd;
  const a = Math.atan2(c.dy, c.dx) + (rand() + rand() + rand() - 1.5) * NOISE[level];
  return { ...c, dx: Math.round(Math.cos(a) * 1e6), dy: Math.round(Math.sin(a) * 1e6) };
}
