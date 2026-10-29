import { settle } from "../../shared/game/engine.ts";
import { highlightOf } from "../../shared/game/highlights.ts";
import { DT, R } from "../../shared/physics/constants.ts";
import type { Ball, SimEvent } from "../../shared/physics/types.ts";
import { prefs } from "../prefs/store.ts";
import type { Session } from "./session.ts";

/** Trail sampling: a new point once a ball has moved 4 mm. */
const TRAIL_STEP2 = 0.004 * 0.004;

function record(S: Session, balls: Ball[]): void {
  const tr = S.trails ??= new Map();
  for (const b of balls) {
    if (!b.on) continue;
    let pts = tr.get(b.id);
    if (!pts) tr.set(b.id, pts = [[b.x, b.y]]);
    const [lx, ly] = pts[pts.length - 1];
    if ((b.x - lx) * (b.x - lx) + (b.y - ly) * (b.y - ly) > TRAIL_STEP2) pts.push([b.x, b.y]);
  }
}

/** Vibration is allowed once the page has had a user gesture (and the setting is on). */
export const canVibrate = (): boolean =>
  prefs.haptics && "vibrate" in navigator && (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive !== false;

/** One vibration per frame, length from the largest contact impulse J (N·s). */
function haptics(ev: SimEvent[]): void {
  if (!ev.length || !canVibrate()) return;
  let j = 0;
  for (const e of ev) j = Math.max(j, e.k === "pocket" || e.k === "off" ? 0.6 : e.k === "jump" ? 0 : e.j);
  const ms = Math.round(Math.min(40, 6 + j * 30));
  if (ms > 7) navigator.vibrate(ms);
}

/**
 * Bullet time: the deepest slow-down any rolling ball deserves right now. A ball closing on a drop circle slows
 * playback toward 0.3×, strongest at the lip. Presentation only — the physics still steps in fixed DT slices.
 */
function bulletFactor(S: Session): number {
  if (!prefs.bulletTime || !S.sim) return 1;
  let f = 1;
  for (const b of S.sim.balls) {
    if (!b.on || b.z > 0.02) continue;
    const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (sp < 0.3) continue;
    for (const p of S.geo.pockets) {
      const dx = p.hx - b.x, dy = p.hy - b.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const range = p.hr + 2.4 * R;
      if (d >= range) continue;
      const closing = (b.vx * dx + b.vy * dy) / (d || 1);
      if (closing > 0.05) f = Math.min(f, 0.3 + 0.7 * (d / range));
    }
  }
  return f;
}

/** Steps the live shot at the chosen playback rate; settles it into the next state when every ball is at rest. */
export function advanceShot(S: Session, dt: number): Ball[] {
  const s = S.sim!;
  const target = bulletFactor(S);
  S.bullet += (target - S.bullet) * 0.2;
  if (Math.abs(S.bullet - target) < 0.01) S.bullet = target;
  S.acc += dt * prefs.playbackSpeed * S.bullet;
  let orientationTime = 0;
  while (S.acc >= DT && !s.done) {
    s.step();
    orientationTime += DT;
    // Orientations are presentation-only. Integrating at 120 Hz avoids thousands of trig calls per second.
    if (orientationTime >= 1 / 120 || s.done) {
      S.orient.advance(s.balls, orientationTime);
      orientationTime = 0;
    }
    S.recording?.capture(s.t, s.balls, S.orient.m, s.done);
    S.acc -= DT;
  }
  if (orientationTime) S.orient.advance(s.balls, orientationTime);
  const fresh = s.events.slice(S.heard);
  S.gfx.audio.events(fresh);
  haptics(fresh);
  const now = performance.now();
  for (const e of fresh) {
    if (e.k === "pocket") {
      const p = S.geo.pockets[e.p];
      const [x] = S.view.toScreen(p.hx, p.hy);
      S.gutter.pocket(e.a, x);
      S.heat.pots[e.p]++;
    } else if (e.k === "jaw") {
      S.jawHits.push({ x: e.x, y: e.y, t: now });
      S.heat.jaws[e.p]++;
      S.shotJaws++;
    } else if (e.k === "rail") {
      S.shotRails++;
      if (prefs.railMarks) S.railMarks.push({ x: e.x, y: e.y, j: e.j, t: now });
    }
  }
  if (S.jawHits.length > 8) S.jawHits.splice(0, S.jawHits.length - 8);
  if (S.railMarks.length > 36) S.railMarks.splice(0, S.railMarks.length - 36);
  S.heard = s.events.length;
  record(S, s.balls);
  if (!s.done) return s.balls;
  const cmd = S.simCmd!, pre = S.state;
  const next = settle(pre, cmd, s);
  S.lastShot = { pre, cmd, cue: S.cues[pre.turn], events: s.events.slice() };
  S.lastRecording = S.recording;
  S.recording = null;
  S.sim = null;
  S.state = next;
  S.gutter.sync(next);
  S.syncCue();
  S.resetAim();
  const h = S.highlightsEnabled && prefs.highlightReplay ? highlightOf(s.events, next) : null;
  if (h && S.lastRecording) S.beginHighlight(h, () => S.hooks.settled(next, cmd));
  else if (S.highlightsEnabled && prefs.instantReplay === "auto" && S.lastRecording && next.winner < 0) {
    S.beginAutoReplay(() => S.hooks.settled(next, cmd));
  } else S.hooks.settled(next, cmd);
  return S.state.balls;
}

/** Presentation-only playback; the next turn is released only after both safety pauses. */
export function advanceReplay(S: Session, dt: number): Ball[] {
  const r = S.replay!;
  const finished = r.advance(dt);
  if (finished) {
    S.replay = null;
    S.onReplay?.(null);
    S.dirty = true;
    r.complete?.();
    return S.state.balls;
  }
  S.onReplay?.(r);
  return r.phase === "playing" ? r.balls : S.state.balls;
}
