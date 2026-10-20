import { ballBall, ballRail } from "./collide.ts";
import { DT, MAX_SIM_TIME, R } from "./constants.ts";
import { advance, moving } from "./motion.ts";
import type { Ball, Geometry, Segment, SimEvent } from "./types.ts";

const INF = Number.POSITIVE_INFINITY;
const D2 = 4 * R * R;

function toiBall(a: Ball, b: Ball, lim: number): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const vx = b.vx - a.vx, vy = b.vy - a.vy;
  const bq = dx * vx + dy * vy;
  if (bq >= 0) return INF;
  const c = dx * dx + dy * dy - D2;
  if (c <= 0) return 0;
  const aq = vx * vx + vy * vy;
  const disc = bq * bq - aq * c;
  if (disc < 0) return INF;
  const t = (-bq - Math.sqrt(disc)) / aq;
  return t < lim ? t : INF;
}

function toiSeg(a: Ball, s: Segment, lim: number): number {
  const vn = a.vx * s.nx + a.vy * s.ny;
  if (vn >= 0) return INF;
  const dist = (a.x - s.ax) * s.nx + (a.y - s.ay) * s.ny - R;
  if (dist < -0.5 * R) return INF;
  const t = dist <= 0 ? 0 : -dist / vn;
  if (t >= lim) return INF;
  const p = (a.x + a.vx * t - s.ax) * s.tx + (a.y + a.vy * t - s.ay) * s.ty;
  return p < 0 || p > s.len ? INF : t;
}

function toiPoint(a: Ball, px: number, py: number, lim: number): number {
  const dx = a.x - px, dy = a.y - py;
  const bq = dx * a.vx + dy * a.vy;
  if (bq >= 0) return INF;
  const c = dx * dx + dy * dy - R * R;
  if (c <= 0) return 0;
  const aq = a.vx * a.vx + a.vy * a.vy;
  const disc = bq * bq - aq * c;
  if (disc < 0) return INF;
  const t = (-bq - Math.sqrt(disc)) / aq;
  return t < lim ? t : INF;
}

/** Fixed-step integrator, continuous collision detection inside each step; events resolved in time order. */
export class Sim {
  t = 0;
  done = false;
  events: SimEvent[] = [];
  balls: Ball[];
  geo: Geometry;
  /** Shooter cue pocket-lip allowance, m. */
  luck: number;
  constructor(balls: Ball[], geo: Geometry, luck = 0) {
    this.luck = luck;
    this.balls = balls;
    this.geo = geo;
    this.done = !balls.some(moving);
  }

  step(): void {
    if (this.done) return;
    const B = this.balls, G = this.geo;
    let rem = DT;
    for (let guard = 0; guard < 64 && rem > 0; guard++) {
      let tmin = rem, kind = 0, i0 = -1, i1 = -1;
      for (let i = 0; i < B.length; i++) {
        const a = B[i];
        if (!a.on) continue;
        const am = moving(a);
        if (am) {
          for (let k = 0; k < G.segments.length; k++) {
            const t = toiSeg(a, G.segments[k], tmin);
            if (t < tmin) {
              tmin = t;
              kind = 2;
              i0 = i;
              i1 = k;
            }
          }
          for (let k = 0; k < G.points.length; k++) {
            const p = G.points[k];
            const t = toiPoint(a, p.x, p.y, tmin);
            if (t < tmin) {
              tmin = t;
              kind = 3;
              i0 = i;
              i1 = k;
            }
          }
        }
        for (let j = i + 1; j < B.length; j++) {
          const b = B[j];
          if (!b.on || (!am && !moving(b))) continue;
          const t = toiBall(a, b, tmin);
          if (t < tmin) {
            tmin = t;
            kind = 1;
            i0 = i;
            i1 = j;
          }
        }
      }
      if (tmin > 0) { for (const b of B) if (moving(b)) advance(b, tmin, G.cloth); }
      this.t += tmin;
      rem -= tmin;
      if (kind === 1) {
        const j = ballBall(B[i0], B[i1]);
        if (j > 0) this.events.push({ k: "ball", t: this.t, a: B[i0].id, b: B[i1].id, j });
      } else if (kind === 2) {
        const s = G.segments[i1];
        const j = ballRail(B[i0], s.nx, s.ny, G.cloth.eCushion);
        if (j > 0) this.events.push({ k: "rail", t: this.t, a: B[i0].id, j });
      } else if (kind === 3) {
        const a = B[i0], p = G.points[i1];
        const dx = a.x - p.x, dy = a.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const j = ballRail(a, dx / d, dy / d, G.cloth.eCushion);
        if (j > 0) this.events.push({ k: "rail", t: this.t, a: a.id, j });
      }
      this.capture();
      if (kind === 0) break;
    }
    if (!B.some(moving) || this.t > MAX_SIM_TIME) {
      for (const b of B) {
        b.vx = 0;
        b.vy = 0;
        b.wx = 0;
        b.wy = 0;
        b.wz = 0;
      }
      this.done = true;
    }
  }

  run(): void {
    while (!this.done) this.step();
  }

  private capture(): void {
    const P = this.geo.pockets;
    for (const b of this.balls) {
      if (!b.on) continue;
      for (let k = 0; k < P.length; k++) {
        const p = P[k];
        const rx = b.x - p.x, ry = b.y - p.y;
        const s = rx * p.dx + ry * p.dy;
        if (s < p.depth - this.luck) continue;
        const lat = rx * p.dy - ry * p.dx;
        if (lat > p.half + R + this.luck || lat < -p.half - R - this.luck) continue;
        b.on = false;
        b.vx = 0;
        b.vy = 0;
        b.wx = 0;
        b.wy = 0;
        b.wz = 0;
        this.events.push({ k: "pocket", t: this.t, a: b.id, p: k });
        break;
      }
    }
  }
}
