import type { Mode } from "../catalog.ts";
import { geometry, newGame } from "./engine.ts";
import { ball } from "./rack.ts";
import type { GameState, Report } from "./types.ts";
import type { SimEvent } from "../physics/types.ts";

export type ChallengeId = "pocket-tour" | "bank-school" | "three-ball";
export const CHALLENGES: { id: ChallengeId; name: string; note: string; stations: number }[] = [
  { id: "pocket-tour", name: "six-pocket tour", note: "Pot the 1 in the highlighted pocket at each of six stations. Fewest strokes wins.", stations: 6 },
  { id: "bank-school", name: "bank school", note: "Pot the 1 after it hits a cushion, at six different stations. Fewest strokes wins.", stations: 6 },
  { id: "three-ball", name: "three-ball sprint", note: "Clear three balls in five shots or fewer. A foul or uncalled pot ends the run.", stations: 1 },
];

/** Deterministic, non-overlapping local practice layouts. Normal venue rules still apply. */
export function challengeState(id: ChallengeId, mode: Mode, table: string, station = 0): GameState {
  const geo = geometry(table), step = ((Math.floor(station) % 6) + 6) % 6;
  const st = newGame(mode, table, (0x3a7 + step * 7919) >>> 0, 0);
  if (id === "pocket-tour") {
    const p = geo.pockets[step];
    st.balls = [ball(0, p.x - p.dx * 0.82, p.y - p.dy * 0.82), ball(1, p.x - p.dx * 0.43, p.y - p.dy * 0.43)];
  } else if (id === "bank-school") {
    const side = step % 2 ? -1 : 1, shift = (Math.floor(step / 2) - 1) * 0.12 * geo.L;
    st.balls = [ball(0, -0.30 * geo.L, side * 0.20 * geo.W), ball(1, 0.10 * geo.L + shift, -side * 0.10 * geo.W)];
  } else {
    // Three accessible hangers on different sides give the five-shot sprint a playable route on every venue.
    st.balls = [ball(0, 0, 0), ...[2, 5, 1].map((pocket, i) => {
      const p = geo.pockets[pocket];
      return ball(i + 1, p.x - p.dx * 0.20, p.y - p.dy * 0.20);
    })];
  }
  st.bih = 0;
  st.broken = true;
  return st;
}

/** A bank must contact a real cushion before the ball drops; jaws and cue-ball rails do not count. */
export function clearsStation(id: "pocket-tour" | "bank-school", station: number, report: Report | null, events: SimEvent[]): boolean {
  if (!report || report.foul || report.uncalled || report.respot.includes(1) || !report.pocketed.includes(1)) return false;
  const pot = events.find((e): e is Extract<SimEvent, { k: "pocket" }> => e.k === "pocket" && e.a === 1);
  if (!pot) return false;
  if (id === "pocket-tour") return pot.p === station;
  return events.some((e) => e.k === "rail" && e.a === 1 && e.t < pot.t);
}
