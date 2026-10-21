import { mustCall, placeError } from "../../shared/game/validate.ts";
import { R } from "../../shared/physics/constants.ts";
import { prefs } from "../prefs/store.ts";
import { toVirt } from "../screen.ts";
import { bindKeys } from "./keys.ts";
import type { Session } from "./session.ts";

/** World metres of drag across the aim line per radian of cue rotation. */
const AIM_RADIUS = 0.75;

/**
 * Table gestures. Dragging anywhere on the cloth turns the cue by the distance moved across the aim line
 * (relative, not point-to-aim), so a long drag is a fine adjustment. With ball in hand a press on the cue
 * ball moves it (a double tap drops it there); when a call is due a tap on a pocket calls it.
 */
export function bindInput(S: Session, el: HTMLElement): () => void {
  let mode: "none" | "aim" | "place" | "move" = "none";
  let moving = -1;
  let lx = 0, ly = 0, lastTap = 0;
  const world = (e: PointerEvent) => S.view.toWorld(...toVirt(e.clientX, e.clientY));
  const cue = () => S.place ?? [S.state.balls[0].x, S.state.balls[0].y];
  const changed = () => {
    S.dirty = true;
    S.hooks.aim?.(S.aim, S.controls.pull, S.place);
  };

  const down = (e: PointerEvent) => {
    if (S.replay) return void (S.replay = null);
    if (!S.canAct()) return;
    const [x, y] = world(e);
    const [cx, cy] = cue();
    if (mustCall(S.state)) {
      const k = S.geo.pockets.findIndex(
        (p) => Math.hypot(p.x - x, p.y - y) < p.mouthHalf * 2.4 + R || Math.hypot(p.hx - x, p.hy - y) < p.hr * 2.2,
      );
      if (k >= 0) {
        S.call = k;
        changed();
        return;
      }
    }
    const now = performance.now();
    if (S.place && now - lastTap < 320 && !placeError(S.state, x, y)) {
      S.place = [x, y];
      changed();
      lastTap = 0;
      return;
    }
    lastTap = now;
    el.setPointerCapture(e.pointerId);
    lx = x;
    ly = y;
    mode = S.place && Math.hypot(x - cx, y - cy) < R * 4 ? "place" : "aim";
    if (mode === "aim" && S.sandbox) {
      const b = S.state.balls.find((b) => b.on && b.id > 0 && Math.hypot(b.x - x, b.y - y) < R * 2);
      if (b) {
        mode = "move";
        moving = b.id;
      }
    }
  };

  const move = (e: PointerEvent) => {
    if (mode === "none" || !S.canAct()) return;
    const [x, y] = world(e);
    if (mode === "move") {
      const b = S.state.balls[moving], hl = S.spec.L / 2 - R, hw = S.spec.W / 2 - R;
      const nx = Math.max(-hl, Math.min(hl, b.x + x - lx)), ny = Math.max(-hw, Math.min(hw, b.y + y - ly));
      const free = S.state.balls.every((o) => o.id === moving || !o.on || Math.hypot(o.x - nx, o.y - ny) >= 2 * R);
      if (free) Object.assign(b, { x: nx, y: ny });
    } else if (mode === "place") {
      const hl = S.spec.L / 2 - R, hw = S.spec.W / 2 - R;
      const xmax = S.state.bih === 1 ? -S.spec.L / 4 : hl;
      S.place = [Math.max(-hl, Math.min(xmax, S.place![0] + x - lx)), Math.max(-hw, Math.min(hw, S.place![1] + y - ly))];
    } else {
      const a = S.aim.angle, dx = x - lx, dy = y - ly;
      S.aim.angle = a + ((Math.cos(a) * dy - Math.sin(a) * dx) * prefs.aimSensitivity) / AIM_RADIUS;
    }
    lx = x;
    ly = y;
    changed();
  };

  const up = (e: PointerEvent) => {
    mode = "none";
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  const unkeys = bindKeys(S, changed);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    unkeys();
  };
}
