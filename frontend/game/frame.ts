import { onPref, prefs } from "../prefs/store.ts";
import { quality } from "../view.ts";
import type { Session } from "./session.ts";

/**
 * Space the stroke controls occupy beside the cloth (rails may pass under them): power bar and fine-aim strip on
 * the near side, elevation dial and tip pad stacked on the far side, each ≥ 24 px (¼ in) from the screen edge.
 */
export const NEAR = 160, FAR = 132;
export const insets = (top: number) => ({ top, bottom: 8, left: prefs.leftHanded ? FAR : NEAR, right: prefs.leftHanded ? NEAR : FAR });

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
