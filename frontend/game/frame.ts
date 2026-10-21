import { onPref, prefs } from "../prefs/store.ts";
import { quality } from "../view.ts";
import type { Session } from "./session.ts";

/**
 * Space beside the cloth: the power band owns the strip from the left screen edge to the left table edge, and the
 * precision band the strip from the right table edge to the right screen edge. The gutter takes the bottom strip.
 * Left-handed play mirrors the bands.
 */
export const POWER_GUTTER = 160, FINE_GUTTER = 126, GUTTER_H = 44;
export const insets = (top: number) => ({
  top,
  bottom: GUTTER_H,
  left: prefs.leftHanded ? FINE_GUTTER : POWER_GUTTER,
  right: prefs.leftHanded ? POWER_GUTTER : FINE_GUTTER,
});

let prefsVersion = 0;
onPref(() => prefsVersion++);

/** Everything that changes what is drawn while the table is still; equal signatures skip the frame. */
export function signature(S: Session, w: number, h: number): string {
  const r = S.remoteAim, p = S.place;
  return `${w}x${h}|${prefsVersion}|${S.state.shot}|${S.aim.angle}|${S.aim.tx},${S.aim.ty},${S.aim.elev}|${S.controls.pull}|${p?.join()}|${S.call}|${
    r ? `${r.a.angle},${r.pull},${r.place?.join()}` : ""
  }|${S.zoom}|${S.canAct()}|${S.state.balls.map((b) => b.on ? b.x + b.y : 0).join()}`;
}

/** Adaptive resolution: frames slower than ~38 fps lower the render scale, fast ones restore it. */
export function adapter(): (ms: number) => void {
  let ema = 16, tuned = 0;
  return (ms: number) => {
    ema += (Math.min(ms, 100) - ema) * 0.05;
    const t = performance.now();
    if (t - tuned < 1500) return;
    if (ema > 26 && quality.scale > 0.6) quality.scale = Math.max(0.6, quality.scale - 0.1);
    else if (ema < 15 && quality.scale < 1) quality.scale = Math.min(1, quality.scale + 0.1);
    else return;
    tuned = t;
  };
}
