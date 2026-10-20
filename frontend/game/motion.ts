import { begin, settle } from "../../shared/game/engine.ts";
import { DT } from "../../shared/physics/constants.ts";
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

/** Steps the live shot at the chosen playback rate; settles it into the next state when every ball is at rest. */
export function advanceShot(S: Session, dt: number): Ball[] {
  const s = S.sim!;
  S.acc += dt * prefs.playbackSpeed;
  while (S.acc >= DT && !s.done) {
    s.step();
    S.orient.advance(s.balls, DT);
    S.acc -= DT;
  }
  const fresh = s.events.slice(S.heard);
  S.gfx.audio.events(fresh);
  haptics(fresh);
  S.heard = s.events.length;
  record(S, s.balls);
  if (!s.done) return s.balls;
  const cmd = S.simCmd!, pre = S.state;
  const next = settle(pre, cmd, s);
  S.lastShot = { pre, cmd, cue: S.cues[pre.turn] };
  S.sim = null;
  S.state = next;
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
