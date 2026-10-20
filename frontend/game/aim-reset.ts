import { legalFirst, target } from "../../shared/game/rules.ts";
import type { Session } from "./session.ts";

/** Aims at the nearest ball the rules allow to be hit first; clears tip, elevation, placement and call. */
export function resetAim(S: Session): void {
  const cb = S.state.balls[0], need = target(S.state);
  let best = Infinity;
  for (const b of S.state.balls) {
    if (!b.on || b.id === 0 || (S.state.broken && !legalFirst(need, b.id))) continue;
    const d = Math.hypot(b.x - cb.x, b.y - cb.y);
    if (d < best) {
      best = d;
      S.aim.angle = Math.atan2(b.y - cb.y, b.x - cb.x);
    }
  }
  S.aim.tx = 0;
  S.aim.ty = 0;
  S.aim.elev = 0;
  S.place = S.state.bih ? [cb.x, cb.y] : null;
  S.call = -1;
  S.controls.paint();
  S.dirty = true;
}
