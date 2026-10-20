import { legalFirst, target } from "../../shared/game/rules.ts";
import { mustCall } from "../../shared/game/validate.ts";
import type { Ball } from "../../shared/physics/types.ts";
import { R } from "../../shared/physics/constants.ts";
import { preview } from "../aim.ts";
import type { OverlayFrame } from "../render/overlay.ts";
import { prefs } from "../prefs/store.ts";
import { adapter, insets, signature } from "./frame.ts";
import { size } from "../screen.ts";
import { advanceReplay, advanceShot } from "./motion.ts";
import type { Session } from "./session.ts";

export function startLoop(S: Session): void {
  let last = performance.now(), sig = "";
  const adapt = adapter();
  const frame = (now: number) => {
    if (!S.running) return;
    const raw = now - last, dt = Math.min(0.1, raw / 1000);
    last = now;
    const v = S.view;
    const { w, h } = size();
    const cb = S.sim?.balls[0] ?? S.replay?.sim.balls[0] ?? S.state.balls[0];
    v.fit(S.spec.L, S.spec.W, w, h, insets(S.top), S.zoom, S.place ?? [cb.x, cb.y]);
    S.controls.setEnabled(S.canAct());
    const live = !!(S.sim || S.replay);
    const rings = S.assist > 1 && S.state.broken && prefs.ringColor === "spectrum";
    const animated = live || S.dirty || v.moving() || (S.canAct() && (mustCall(S.state) || rings));
    const s2 = animated ? "" : signature(S, w, h);
    if (animated || s2 !== sig) {
      const balls = S.sim ? advanceShot(S, dt) : S.replay ? advanceReplay(S, dt) : withCueAt(S.state.balls, handPos(S));
      S.gfx.renderer.draw(v, balls, S.orient.m);
      S.gfx.overlay.draw(v, overlayFrame(S, now, balls), S.geo, S.spec.L, S.spec.W);
      v.settle();
      sig = animated ? "" : signature(S, w, h);
      if (live) adapt(raw);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Where the cue ball is being placed with ball in hand: by the local shooter, or as last reported by the remote one. */
function handPos(S: Session): [number, number] | null {
  if (!S.state.bih || S.state.winner >= 0) return null;
  if (S.canAct()) return S.place;
  return S.remoteAim?.place ?? null;
}

function withCueAt(balls: Ball[], at: [number, number] | null): Ball[] {
  if (!at) return balls;
  const out = balls.slice();
  out[0] = { ...balls[0], x: at[0], y: at[1], on: true };
  return out;
}

/** ±2σ stroke error at the pending power, out to the predicted contact (or the guide length). */
function coneOf(S: Session, at: [number, number]): OverlayFrame["cone"] {
  const cue = S.myCue(), p = Math.pow(S.controls.pull || 0.5, prefs.powerCurve);
  const g = S.prev?.ghost;
  const len = g ? Math.hypot(g[0] - at[0], g[1] - at[1]) + R : Math.max(0.5, cue.guide);
  return { x: at[0], y: at[1], angle: S.aim.angle, sigma: cue.wobble * (0.3 + 0.7 * p), len };
}

function overlayFrame(S: Session, now: number, balls: Ball[]): OverlayFrame {
  const cb = S.state.balls[0];
  const moving = S.sim || S.replay ? balls : null;
  const f: OverlayFrame = { preview: null, stick: null, place: null, pockets: null, targets: [], cone: null, trails: S.trails, moving, balls, bankFrom: null };
  if (moving) return f;
  if (S.canAct()) {
    if (S.dirty && now - S.prevAt > (S.assist === 4 ? 110 : 40)) {
      S.prevAt = now;
      S.prev = S.placeOk() ? preview(S.state, S.cmdFor(S.controls.pull || 0.5), S.myCue(), S.assist) : null;
      S.dirty = false;
    }
    const at = S.place ?? [cb.x, cb.y];
    f.preview = S.prev;
    f.stick = { x: at[0], y: at[1], angle: S.aim.angle, pull: S.controls.pull, cue: S.myCue(), ghost: false };
    if (S.assist > 1) f.cone = coneOf(S, at);
    if (S.place) f.place = { x: S.place[0], y: S.place[1], ok: S.placeOk(), kitchen: S.state.bih === 1 ? -S.spec.L / 4 : null };
    if (S.assist > 1 && S.state.broken) {
      const need = target(S.state);
      f.targets = S.state.balls.filter((b) => b.on && legalFirst(need, b.id)).map((b) => [b.x, b.y]);
      const t = S.prev && S.prev.target > 0 ? S.state.balls[S.prev.target] : null;
      if (t) f.bankFrom = [t.x, t.y];
    }
    if (mustCall(S.state)) f.pockets = { called: S.call, pulse: 0.5 + 0.5 * Math.sin(now / 180) };
  } else if (S.remoteAim && S.state.winner < 0 && !prefs.hideOpponentCue) {
    const at = S.remoteAim.place ?? [cb.x, cb.y];
    f.stick = { x: at[0], y: at[1], angle: S.remoteAim.a.angle, pull: S.remoteAim.pull, cue: S.cues[S.state.turn], ghost: true };
  }
  return f;
}
