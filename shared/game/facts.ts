import type { SimEvent } from "../physics/types.ts";
import { type Rules, rulesOf } from "../venues.ts";
import type { GameState, Group, ShotFacts } from "./types.ts";

export const groupOf = (id: number): Group => (id >= 1 && id <= 7 ? 1 : id >= 9 && id <= 15 ? 2 : 0);

export function facts(ev: SimEvent[]): ShotFacts {
  let first = -1, tFirst = Number.POSITIVE_INFINITY, railAfter = false;
  const railSet = new Set<number>();
  const pocketed: number[] = [];
  const offTable: number[] = [];
  const pockets = new Map<number, number>();
  for (const e of ev) {
    if (e.k === "ball" && first < 0 && (e.a === 0 || e.b === 0)) {
      first = e.a === 0 ? e.b : e.a;
      tFirst = e.t;
    } else if (e.k === "rail") {
      if (e.a !== 0) railSet.add(e.a);
      if (e.t >= tFirst) railAfter = true;
    } else if (e.k === "off") {
      offTable.push(e.a);
    } else if (e.k === "pocket") {
      pockets.set(e.a, e.p);
      if (e.a !== 0) pocketed.push(e.a);
    }
  }
  return { first, railAfter, railBalls: railSet.size, pocketed, pockets, scratch: pockets.has(0), offTable };
}

/** Group still on the table for player p, evaluated on the pre-shot rack. */
export function remaining(st: GameState, p: 0 | 1): number {
  const g = st.groups[p];
  if (g === 0) return -1;
  return st.balls.filter((b) => b.on && groupOf(b.id) === g).length;
}

export function lowest(st: GameState): number {
  let m = 99;
  for (const b of st.balls) if (b.on && b.id > 0 && b.id < m) m = b.id;
  return m;
}

/** What the shooter must contact first: a ball id, or −1 solids / −2 stripes / −3 any but the 8. */
export function target(st: GameState): number {
  if (!st.broken) return st.mode === 8 ? -3 : 1;
  if (st.mode !== 8) return lowest(st);
  const g = st.groups[st.turn];
  if (g === 0) return -3;
  return remaining(st, st.turn) === 0 ? 8 : -g;
}

export const legalFirst = (need: number, id: number): boolean => id > 0 && (need > 0 ? id === need : need === -3 ? id !== 8 : groupOf(id) === -need);

/** Whether the shot about to be played must name a pocket. */
export function needsCall(st: GameState, r: Rules = rulesOf(st.table)): boolean {
  if (!st.broken || st.winner >= 0) return false;
  if (r.callShot || st.mode === 10) return true;
  return st.mode !== 15 && r.callEight && target(st) === st.mode;
}
