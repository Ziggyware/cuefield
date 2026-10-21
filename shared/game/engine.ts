import { recordShot } from "../rewards.ts";
import { type CueSpec, type Mode, rulesOf, tableById } from "../catalog.ts";
import { R } from "../physics/constants.ts";
import { buildGeometry } from "../physics/geometry.ts";
import { Sim } from "../physics/sim.ts";
import { strike } from "../physics/strike.ts";
import type { Ball, Geometry } from "../physics/types.ts";
import { rack, respot, rng } from "./rack.ts";
import { facts, judge8, judge9, judgeRot } from "./rules.ts";
import type { GameState, Report, StrikeCmd } from "./types.ts";

const geoCache = new Map<string, Geometry>();
export function geometry(table: string): Geometry {
  let g = geoCache.get(table);
  if (!g) {
    const spec = tableById(table);
    if (!spec) throw new Error("table");
    g = buildGeometry(spec);
    geoCache.set(table, g);
  }
  return g;
}

export function newGame(mode: Mode, table: string, seed: number, breaker: 0 | 1): GameState {
  const g = geometry(table);
  return {
    mode,
    table,
    balls: rack(mode, g.L, seed),
    turn: breaker,
    shot: 0,
    broken: false,
    groups: [0, 0],
    bih: 1,
    fouls: [0, 0],
    winner: -1,
    last: null,
    seed: seed >>> 0,
    score: [0, 0],
  };
}

const clone = (b: Ball): Ball => ({ ...b });

/**
 * Stroke error for this shot as tan(φ/2): Irwin–Hall sum of four uniforms (unit variance, + × √ only) from the rack seed
 * and shot number, scaled by the cue's wobble and by power (a soft stroke strays less).
 */
export function wobbleOf(st: GameState, c: StrikeCmd, cue: CueSpec): number {
  if (!cue.wobble) return 0;
  const r = rng(((st.seed ?? 0) ^ Math.imul(st.shot + 1, 0x9e3779b1)) >>> 0);
  const z = (r() + r() + r() + r() - 2) * Math.sqrt(3);
  const p = Math.max(1, Math.min(1000, Math.round(c.power))) / 1000;
  return 0.5 * z * cue.wobble * (0.3 + 0.7 * p);
}

/** Copies the rack, applies ball-in-hand placement and the cue impulse; the caller steps the returned Sim. exact: no stroke error (aim preview). */
export function begin(st: GameState, c: StrikeCmd, cue: CueSpec, exact = false): Sim {
  const balls = st.balls.map(clone);
  const cb = balls[0];
  if (c.place) {
    cb.x = c.place[0];
    cb.y = c.place[1];
    cb.on = true;
  }
  strike(cb, c, cue, exact ? 0 : wobbleOf(st, c, cue));
  return new Sim(balls, geometry(st.table), exact ? 0 : cue.luck);
}

function restoreCue(balls: Ball[], L: number) {
  const cb = balls[0];
  if (cb.on) return;
  const step = 2 * R + 1e-4;
  let x = -L / 4;
  const free = () => balls.every((o) => o.id === 0 || !o.on || (o.x - x) * (o.x - x) + o.y * o.y >= 4 * R * R);
  while (!free()) x -= step;
  Object.assign(cb, { x, y: 0, vx: 0, vy: 0, wx: 0, wy: 0, wz: 0, on: true });
}

function advanceTurn(st: GameState, balls: Ball[], rep: Report): GameState {
  const g = geometry(st.table);
  const p = st.turn, o = (1 - p) as 0 | 1;
  for (const id of rep.respot) respot(balls, balls[id], g.L);
  restoreCue(balls, g.L);
  const groups: GameState["groups"] = [st.groups[0], st.groups[1]];
  if (rep.assign) {
    groups[p] = rep.assign;
    groups[o] = rep.assign === 1 ? 2 : 1;
  }
  const score: [number, number] = [st.score?.[0] ?? 0, st.score?.[1] ?? 0];
  if (rep.points) score[p] += rep.points;
  const fouls: GameState["fouls"] = [st.fouls[0], st.fouls[1]];
  fouls[p] = rep.foul ? fouls[p] + 1 : 0;
  return {
    ...st,
    balls,
    groups,
    fouls,
    score,
    shot: st.shot + 1,
    broken: true,
    winner: rep.win,
    turn: rep.win >= 0 || rep.keep ? p : o,
    bih: rep.win >= 0 ? 0 : rep.foul ? (st.mode === 8 && !st.broken && rep.foul === "scratch" ? 1 : 2) : 0,
    last: rep,
    stats: recordShot(st.stats, rep),
  };
}

export function settle(st: GameState, c: StrikeCmd, sim: Sim): GameState {
  const f = facts(sim.events);
  const rep = st.mode === 8 ? judge8(st, c, f) : st.mode === 15 ? judgeRot(st, c, f) : judge9(st, c, f);
  return advanceTurn(st, sim.balls, rep);
}

export function timeout(st: GameState): GameState {
  const p = st.turn, o = (1 - p) as 0 | 1;
  const lose = rulesOf(st.table).threeFoul && st.fouls[p] + 1 >= 3;
  const rep: Report = {
    by: p,
    foul: "timeout",
    pocketed: [],
    keep: false,
    respot: [],
    win: lose ? o : -1,
    hit: -1,
    need: 0,
    uncalled: false,
    assign: 0,
    end: lose ? "three-fouls" : null,
  };
  return advanceTurn(st, st.balls.map(clone), rep);
}

export function concede(st: GameState, who: 0 | 1): GameState {
  return { ...st, winner: (1 - who) as 0 | 1 };
}

/** Full deterministic replay of one strike (server authority; bot search passes exact to plan without stroke error). */
export function play(st: GameState, c: StrikeCmd, cue: CueSpec, exact = false): { state: GameState; sim: Sim } {
  const sim = begin(st, c, cue, exact);
  sim.run();
  return { state: settle(st, c, sim), sim };
}
