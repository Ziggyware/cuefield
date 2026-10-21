import { begin, settle } from "../../shared/game/engine.ts";
import { DT, R } from "../../shared/physics/constants.ts";
import type { Ball, SimEvent } from "../../shared/physics/types.ts";
import { prefs } from "../prefs/store.ts";
import type { Session } from "./session.ts";

/** Trail sampling: a new point once a ball has moved 4 mm. */
const TRAIL_STEP2 = 0.004 * 0.004;
/** Instant replay plays the physics log at this fraction of real time. */
const REPLAY_SPEED = 0.35;

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
  for (const e of ev) j = Math.max(j, e.k === "pocket" ? 0.6 : e.j);
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
  while (S.acc >= DT && !s.done) {
    s.step();
    S.orient.advance(s.balls, DT);
    S.acc -= DT;
  }
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
  S.lastShot = { pre, cmd, cue: S.cues[pre.turn] };
  S.sim = null;
  S.state = next;
  S.gutter.sync(next);
  S.syncCue();
  S.resetAim();
  S.hooks.settled(next, cmd);
  if (prefs.instantReplay === "auto" && next.winner < 0 && !S.sim) S.startReplay();
  return S.state.balls;
}

/** Visual-only re-run of the last shot from its logged stroke; the authoritative state is untouched. */
export function advanceReplay(S: Session, dt: number): Ball[] {
  const r = S.replay!;
  r.acc += dt * REPLAY_SPEED;
  while (r.acc >= DT && !r.sim.done) {
    r.sim.step();
    S.orient.advance(r.sim.balls, DT);
    r.acc -= DT;
  }
  S.gfx.audio.events(r.sim.events.slice(r.heard));
  r.heard = r.sim.events.length;
  if (r.sim.done) S.replay = null;
  return r.sim.balls;
}

export function replaySim(S: Session) {
  const l = S.lastShot!;
  return { sim: begin(l.pre, l.cmd, l.cue), acc: 0, heard: 0 };
}
