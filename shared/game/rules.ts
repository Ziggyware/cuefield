import type { Rules } from "../venues.ts";
import { rulesOf } from "../venues.ts";
import { ROTATION_TARGET } from "../catalog.ts";
import { groupOf, legalFirst, needsCall, target } from "./facts.ts";
import type { Foul, GameState, Report, ShotFacts, StrikeCmd } from "./types.ts";

export * from "./facts.ts";

function base(pre: GameState, f: ShotFacts, need: number): Report {
  return { by: pre.turn, foul: null, pocketed: f.pocketed, keep: false, respot: [], win: -1, hit: f.first, need, uncalled: false, assign: 0, end: null };
}

function strokeFoul(pre: GameState, f: ShotFacts, need: number, r: Rules): Foul {
  if (f.scratch) return "scratch";
  if (f.first < 0) return "no-contact";
  if (!pre.broken) return r.breakRule && f.pocketed.length === 0 && f.railBalls < 4 ? "bad-break" : null;
  if (!legalFirst(need, f.first)) return "wrong-ball";
  return r.railRule && f.pocketed.length === 0 && !f.railAfter ? "no-rail" : null;
}

function threeFouls(pre: GameState, rep: Report, r: Rules): void {
  if (rep.foul && r.threeFoul && pre.fouls[pre.turn] + 1 >= 3) {
    rep.win = (1 - pre.turn) as 0 | 1;
    rep.end = "three-fouls";
  }
}

/** Eight-ball. Every venue: legal first contact, scratch, ball in hand. Higher venues add the flags in Rules. */
export function judge8(pre: GameState, cmd: StrikeCmd, f: ShotFacts, r: Rules = rulesOf(pre.table)): Report {
  const p = pre.turn, o = (1 - p) as 0 | 1;
  const need = target(pre);
  const rep = base(pre, f, need);
  rep.foul = strokeFoul(pre, f, need, r);
  const eight = f.pocketed.includes(8);
  if (!pre.broken) {
    if (eight) rep.respot.push(8);
    rep.keep = !rep.foul && f.pocketed.some((id) => id !== 8);
    return rep;
  }
  if (eight) {
    const called = !needsCall(pre, r) || f.pockets.get(8) === cmd.call;
    const legal = need === 8 && !rep.foul && called;
    rep.win = legal ? p : o;
    rep.end = legal ? "eight" : need !== 8 ? "eight-early" : rep.foul ? "eight-foul" : "eight-pocket";
    return rep;
  }
  threeFouls(pre, rep, r);
  if (rep.foul) return rep;
  const mine = f.pocketed.filter((id) => (need === -3 ? true : groupOf(id) === -need));
  const scored = r.callShot ? mine.filter((id) => f.pockets.get(id) === cmd.call) : mine;
  rep.keep = scored.length > 0;
  rep.uncalled = r.callShot && !rep.keep && f.pocketed.length > 0;
  if (need === -3 && rep.keep) rep.assign = groupOf(scored[0]);
  return rep;
}

/** Nine- and ten-ball: lowest ball first; the game ball legally pocketed wins (10-ball: in the called pocket, never on the break). */
export function judge9(pre: GameState, cmd: StrikeCmd, f: ShotFacts, r: Rules = rulesOf(pre.table)): Report {
  const p = pre.turn, gb = pre.mode;
  const need = target(pre);
  const rep = base(pre, f, need);
  rep.foul = strokeFoul(pre, f, need, r);
  const game = f.pocketed.includes(gb);
  const call = needsCall(pre, r), calls = r.callShot || pre.mode === 10;
  if (rep.foul) {
    if (game) rep.respot.push(gb);
    threeFouls(pre, rep, r);
    return rep;
  }
  const breakTen = !pre.broken && gb === 10;
  if (game && !breakTen && (!call || f.pockets.get(gb) === cmd.call)) {
    rep.win = p;
    rep.end = gb === 9 ? "nine" : "ten";
    return rep;
  }
  if (game) rep.respot.push(gb);
  const scored = f.pocketed.filter((id) => id !== gb && (!calls || !pre.broken || f.pockets.get(id) === cmd.call));
  rep.keep = scored.length > 0;
  rep.uncalled = (calls || call) && !rep.keep && f.pocketed.length > 0;
  return rep;
}

/**
 * Rotation: lowest ball first; every legally pocketed ball scores its number. Balls pocketed on a foul are spotted.
 * First to 61 wins; if the table clears first, the higher score wins (the shooter on a tie).
 */
export function judgeRot(pre: GameState, cmd: StrikeCmd, f: ShotFacts, r: Rules = rulesOf(pre.table)): Report {
  const p = pre.turn, o = (1 - p) as 0 | 1;
  const need = target(pre);
  const rep = base(pre, f, need);
  rep.foul = strokeFoul(pre, f, need, r);
  if (rep.foul) {
    rep.respot.push(...f.pocketed);
    threeFouls(pre, rep, r);
    return rep;
  }
  const scored = f.pocketed.filter((id) => !r.callShot || !pre.broken || f.pockets.get(id) === cmd.call);
  rep.respot.push(...f.pocketed.filter((id) => !scored.includes(id)));
  rep.points = scored.reduce((s, id) => s + id, 0);
  rep.keep = scored.length > 0;
  rep.uncalled = r.callShot && !rep.keep && f.pocketed.length > 0;
  const sc = pre.score ?? [0, 0], mine = sc[p] + rep.points;
  const left = pre.balls.some((b) => b.on && b.id > 0 && !scored.includes(b.id));
  if (mine >= ROTATION_TARGET || !left) {
    rep.win = mine >= sc[o] ? p : o;
    rep.end = "points";
  }
  return rep;
}
