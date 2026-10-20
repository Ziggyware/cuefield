import { groupOf } from "../../shared/game/rules.ts";
import type { GameState } from "../../shared/game/types.ts";
import { h } from "../dom.ts";
import { paletteHex } from "../prefs/look.ts";

export function ballDot(id: number): HTMLElement {
  const c = paletteHex();
  const bg = id > 8 ? `linear-gradient(${c[0]} 0 28%,${c[id]} 28% 72%,${c[0]} 72%)` : c[id];
  return h("i", { style: `background:${bg};border:1px solid #2a2e26` });
}

/** 8-ball: the seat's group still on the table (or the 8 once cleared); 9-ball: the shared object sequence on seat 0's card. */
export function ownBalls(st: GameState, seat: 0 | 1): number[] {
  const on = st.balls.filter((b) => b.on && b.id > 0).map((b) => b.id);
  if (st.mode !== 8) return seat === st.turn ? on : [];
  const g = st.groups[seat];
  if (!g) return [];
  const mine = on.filter((id) => groupOf(id) === g);
  return mine.length ? mine : on.includes(8) ? [8] : [];
}
