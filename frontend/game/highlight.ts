import { MAX_SIM_TIME } from "../../shared/physics/constants.ts";
import type { Ball } from "../../shared/physics/types.ts";

const SAMPLE_SECONDS = 1 / 30;
const MAX_FRAMES = Math.ceil(MAX_SIM_TIME / SAMPLE_SECONDS) + 4;
const ORIENT_SIZE = 16 * 9;
export const REPLAY_BUFFER_SECONDS = 2;
export const REPLAY_SPEED = 0.4;

/** Bounded, render-only frames. The authoritative physics state is never rewound or mutated. */
export class ShotRecording {
  private positions: Float32Array;
  private orientations = new Float32Array(MAX_FRAMES * ORIENT_SIZE);
  private times = new Float64Array(MAX_FRAMES);
  private ids: number[];
  private templates: Ball[];
  private next = 0;
  count = 0;

  constructor(balls: Ball[]) {
    this.ids = balls.map((b) => b.id);
    this.templates = balls.map((b) => ({ ...b }));
    this.positions = new Float32Array(MAX_FRAMES * balls.length * 4);
  }

  capture(t: number, balls: Ball[], orientation: Float32Array, force = false): void {
    if (this.count >= MAX_FRAMES || (!force && t + 1e-8 < this.next)) return;
    if (this.count && t <= this.times[this.count - 1]) return;
    const n = this.count++, stride = this.ids.length * 4;
    this.times[n] = t;
    for (let i = 0; i < this.ids.length; i++) {
      const b = balls[i], o = n * stride + i * 4;
      this.positions[o] = b.x; this.positions[o + 1] = b.y; this.positions[o + 2] = b.z;
      this.positions[o + 3] = b.on ? 1 : 0;
    }
    this.orientations.set(orientation, n * ORIENT_SIZE);
    this.next = t + SAMPLE_SECONDS;
  }

  get duration(): number { return this.count ? this.times[this.count - 1] : 0; }
  makeBalls(): Ball[] { return this.templates.map((b) => ({ ...b })); }

  /** Interpolate positions but switch presence at the later sample, so a drop cannot reappear. */
  read(t: number, balls: Ball[], orientation: Float32Array): void {
    if (!this.count) return;
    let lo = 0, hi = this.count - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (this.times[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    const next = Math.min(lo + 1, this.count - 1), a = this.times[lo], b = this.times[next];
    const f = b > a ? Math.max(0, Math.min(1, (t - a) / (b - a))) : 0;
    const stride = this.ids.length * 4;
    for (let i = 0; i < this.ids.length; i++) {
      const p = lo * stride + i * 4, q = next * stride + i * 4, out = balls[i];
      out.x = this.positions[p] + f * (this.positions[q] - this.positions[p]);
      out.y = this.positions[p + 1] + f * (this.positions[q + 1] - this.positions[p + 1]);
      out.z = this.positions[p + 2] + f * (this.positions[q + 2] - this.positions[p + 2]);
      out.on = !!this.positions[p + 3];
    }
    orientation.set(this.orientations.subarray(lo * ORIENT_SIZE, (lo + 1) * ORIENT_SIZE));
  }
}

export type ReplayPhase = "before" | "playing" | "after";

/** Two seconds of input lock on each side of a short, slow-motion clip. */
export class HighlightReplay {
  phase: ReplayPhase = "before";
  elapsed = 0;
  cursor: number;
  balls: Ball[];
  orientation = new Float32Array(ORIENT_SIZE);
  focus: [number, number];
  constructor(
    public recording: ShotRecording,
    public label: string,
    public ball: number,
    public start: number,
    public end: number,
    focus: [number, number],
    public complete: (() => void) | null = null,
  ) {
    this.start = Math.max(0, Math.min(start, recording.duration));
    this.end = Math.max(this.start, Math.min(end, recording.duration));
    this.cursor = this.start;
    this.focus = focus;
    this.balls = recording.makeBalls();
    recording.read(this.cursor, this.balls, this.orientation);
  }

  /** dt is presentation time, not physics time; returns true exactly when the lock ends. */
  advance(dt: number): boolean {
    let left = Math.max(0, dt);
    for (let i = 0; i < 3 && left > 0; i++) {
      if (this.phase === "playing") {
        const remaining = (this.end - this.cursor) / REPLAY_SPEED;
        const used = Math.min(left, remaining);
        this.cursor = Math.min(this.end, this.cursor + used * REPLAY_SPEED);
        left -= used;
        this.recording.read(this.cursor, this.balls, this.orientation);
        if (remaining <= used + 1e-9) { this.phase = "after"; this.elapsed = 0; }
        else break;
      } else {
        const used = Math.min(left, REPLAY_BUFFER_SECONDS - this.elapsed);
        this.elapsed += used;
        left -= used;
        if (this.elapsed + 1e-9 < REPLAY_BUFFER_SECONDS) break;
        if (this.phase === "after") return true;
        this.phase = "playing"; this.elapsed = 0;
      }
    }
    return false;
  }
}
