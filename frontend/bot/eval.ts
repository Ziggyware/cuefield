import { geometry } from "../../shared/game/engine.ts";
import { legalFirst, target } from "../../shared/game/rules.ts";
import type { GameState } from "../../shared/game/types.ts";
import { placeError } from "../../shared/game/validate.ts";
import { R } from "../../shared/physics/constants.ts";

export function legalTargets(st: GameState): number[] {
  const need = target(st);
  return st.balls.filter((b) => b.on && legalFirst(need, b.id)).map((b) => b.id);
}

/** Count of straight-in pots available to the shooter afterwards: a cheap position heuristic. */
function leave(st: GameState): number {
  const cb = st.balls[0], geo = geometry(st.table);
  let n = 0;
  for (const id of legalTargets(st)) {
    const b = st.balls[id];
    for (const p of geo.pockets) {
      const ux = p.x - b.x, uy = p.y - b.y, ul = Math.hypot(ux, uy);
      const gx = b.x - (ux / ul) * 2 * R, gy = b.y - (uy / ul) * 2 * R;
      const ax = gx - cb.x, ay = gy - cb.y, al = Math.hypot(ax, ay);
      if ((ax * ux + ay * uy) / (al * ul) > 0.5) n++;
    }
  }
  return n;
}

/** Rotation: ball values scored by the shot, so the bot prefers the 15 to the 1 when both drop. */
const gained = (pre: GameState, post: GameState) => (post.score?.[pre.turn] ?? 0) - (pre.score?.[pre.turn] ?? 0);

export function score(pre: GameState, post: GameState): number {
  const me = pre.turn;
  if (post.winner === me) return 10_000;
  if (post.winner >= 0) return -10_000;
  if (post.last?.foul) return -800;
  const pts = 12 * gained(pre, post);
  if (post.turn === me) return 400 + 25 * leave(post) + 60 * (post.last?.pocketed.length ?? 0) + pts;
  return pts - 40 * leave(post);
}

/** First legal ball-in-hand spot on a coarse grid: the fallback when no planned placement was legal. */
export function anyPlace(st: GameState, L: number, W: number): [number, number] {
  for (let i = 1; i < 12; i++) {
    for (let j = 1; j < 6; j++) {
      const x = -L / 2 + (L * i) / 12, y = -W / 2 + (W * j) / 6;
      if (!placeError(st, x, y)) return [x, y];
    }
  }
  return [st.balls[0].x, st.balls[0].y];
}
