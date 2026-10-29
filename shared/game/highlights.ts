import type { SimEvent } from "../physics/types.ts";
import type { GameState } from "./types.ts";

export interface Highlight {
  kind: "off" | "jump" | "multi" | "win";
  label: string;
  t: number;
  ball: number;
  pocket?: number;
  x?: number;
  y?: number;
}

/** Pick one bounded highlight per shot; table exits take priority over jumps and scoring moments. */
export function highlightOf(events: SimEvent[], state: GameState): Highlight | null {
  const off = events.find((e) => e.k === "off");
  if (off?.k === "off") return { kind: "off", label: "BALL OFF THE TABLE", t: off.t, ball: off.a, x: off.x, y: off.y };
  const jump = events.find((e) => e.k === "jump");
  if (jump?.k === "jump") return { kind: "jump", label: "JUMP SHOT", t: jump.t, ball: jump.a, x: jump.x, y: jump.y };
  const pots = events.filter((e): e is Extract<SimEvent, { k: "pocket" }> => e.k === "pocket" && e.a > 0);
  if (pots.length >= 2) {
    const p = pots[1];
    return { kind: "multi", label: "MULTI-BALL DROP", t: p.t, ball: p.a, pocket: p.p };
  }
  if (state.winner >= 0 && pots.length) {
    const p = pots.find((e) => e.a === state.mode) ?? pots[pots.length - 1];
    return { kind: "win", label: "WINNING SHOT", t: p.t, ball: p.a, pocket: p.p };
  }
  return null;
}
