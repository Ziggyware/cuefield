import { ballBall, ballJaw, ballRail } from "./collide.ts";
import { DT, E_JAW, G, MAX_SIM_TIME, POCKET_CLEAR, R, RAIL_CLEAR } from "./constants.ts";
import { advance, moving } from "./motion.ts";
import type { Ball, Geometry, Jaw, Segment, SimEvent } from "./types.ts";

const INF = Number.POSITIVE_INFINITY;
const D2 = 4 * R * R;

function toiBall(a: Ball, b: Ball, lim: number): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const vx = b.vx - a.vx, vy = b.vy - a.vy, vz = b.vz - a.vz;
  // Conservative swept AABB rejects distant pairs without evaluating the quadratic.
  if (Math.abs(dx) > 2 * R + Math.abs(vx) * lim || Math.abs(dy) > 2 * R + Math.abs(vy) * lim || Math.abs(dz) > 2 * R + Math.abs(vz) * lim) return INF;
  const bq = dx * vx + dy * vy + dz * vz;
  if (bq >= 0) return INF;
  const c = dx * dx + dy * dy + dz * dz - D2;
  if (c <= 0) return 0;
  const aq = vx * vx + vy * vy + vz * vz;
  const disc = bq * bq - aq * c;
  if (disc < 0) return INF;
  const t = c / (-bq + Math.sqrt(disc));
  return t < lim ? t : INF;
}

function toiSeg(a: Ball, s: Segment, lim: number): number {
  const vn = a.vx * s.nx + a.vy * s.ny;
  if (vn >= 0) return INF;
  const dist = (a.x - s.ax) * s.nx + (a.y - s.ay) * s.ny - R;
  if (dist < -0.5 * R) return INF;
  const t = dist <= 0 ? 0 : -dist / vn;
  if (t >= lim) return INF;
  // z is height above the slate; a ball above the nose can clear the cushion.
  if (a.z + a.vz * t - 0.5 * G * t * t > RAIL_CLEAR) return INF;
  const p = (a.x + a.vx * t - s.ax) * s.tx + (a.y + a.vy * t - s.ay) * s.ty;
  return p < 0 || p > s.len ? INF : t;
}

/** Time to touch a fixed round post of radius `rad` (0 for the sharp cushion joints). */
function toiPost(a: Ball, px: number, py: number, rad: number, lim: number): number {
  const dx = a.x - px, dy = a.y - py;
  const reach = R + rad;
  if (Math.abs(dx) > reach + Math.abs(a.vx) * lim || Math.abs(dy) > reach + Math.abs(a.vy) * lim) return INF;
  const bq = dx * a.vx + dy * a.vy;
  if (bq >= 0) return INF;
  const c = dx * dx + dy * dy - (R + rad) * (R + rad);
  if (c <= 0) return 0;
  const aq = a.vx * a.vx + a.vy * a.vy;
  const disc = bq * bq - aq * c;
  if (disc < 0) return INF;
  const t = c / (-bq + Math.sqrt(disc));
  return t < lim ? t : INF;
}


/** First intersection of a swept centre with a circular drop, in [0, 1]. */
function circleEntry(x: number, y: number, dx: number, dy: number, cx: number, cy: number, radius: number): number {
  const rx = x - cx, ry = y - cy;
  const c = rx * rx + ry * ry - radius * radius;
  if (c <= 0) return 0;
  const a = dx * dx + dy * dy, b = rx * dx + ry * dy;
  if (a === 0 || b >= 0) return INF;
  const disc = b * b - a * c;
  if (disc < 0) return INF;
  // Rationalised root avoids subtracting nearly equal numbers at grazing contact.
  const u = c / (-b + Math.sqrt(disc));
  return u <= 1 ? u : INF;
}

const RAIL_WIDTH = 0.11;
const JUMP_HEIGHT = 0.5 * R;

/** Fixed-step integrator, continuous collision detection inside each step; events resolved in time order. */
export class Sim {
  t = 0;
  done = false;
  events: SimEvent[] = [];
  balls: Ball[];
  geo: Geometry;
  /** Every jaw tip flattened with the pocket it belongs to. */
  jaws: (Jaw & { p: number })[];
  /** Shooter cue pocket-lip allowance, m. */
  luck: number;
  private active: Uint8Array;
  private activeIds: Uint8Array;
  private jumped: Uint8Array;
  private previous: Float64Array;

  constructor(balls: Ball[], geo: Geometry, luck = 0) {
    this.luck = luck;
    this.balls = balls;
    this.geo = geo;
    this.jaws = geo.pockets.flatMap((p, i) => p.jaws.map((j) => ({ ...j, p: i })));
    this.active = new Uint8Array(balls.length);
    this.activeIds = new Uint8Array(balls.length);
    this.jumped = new Uint8Array(balls.length);
    this.previous = new Float64Array(balls.length * 3);
    this.done = !balls.some(moving);
  }

  step(): void {
    if (this.done) return;
    const B = this.balls, G = this.geo;
    let rem = DT;
    for (let guard = 0; guard < 96 && rem > 0; guard++) {
      let tmin = rem, kind = 0, i0 = -1, i1 = -1;
      let activeCount = 0;
      for (let i = 0; i < B.length; i++) {
        this.active[i] = moving(B[i]) ? 1 : 0;
        if (this.active[i]) this.activeIds[activeCount++] = i;
      }
      for (let i = 0; i < B.length; i++) {
        const a = B[i];
        if (!a.on) continue;
        const am = this.active[i] !== 0;
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
          // A ball above the nose no longer meets the little posts; the cushion body still deflects it below.
          if (a.z <= RAIL_CLEAR) {
            for (let k = 0; k < G.points.length; k++) {
              const p = G.points[k];
              const t = toiPost(a, p.x, p.y, 0, tmin);
              if (t < tmin) {
                tmin = t;
                kind = 3;
                i0 = i;
                i1 = k;
              }
            }
            for (let k = 0; k < this.jaws.length; k++) {
              const j = this.jaws[k];
              const t = toiPost(a, j.x, j.y, j.r, tmin);
              if (t < tmin) {
                tmin = t;
                kind = 4;
                i0 = i;
                i1 = k;
              }
            }
          }
        }
        // A stationary ball only needs pairs with later active balls, keeping the original tie order.
        const limit = am ? B.length : activeCount;
        for (let k = am ? i + 1 : 0; k < limit; k++) {
          const j = am ? k : this.activeIds[k];
          if (j <= i) continue;
          const b = B[j];
          if (!b.on) continue;
          const t = toiBall(a, b, tmin);
          if (t < tmin) {
            tmin = t;
            kind = 1;
            i0 = i;
            i1 = j;
          }
        }
      }
      for (let i = 0; i < B.length; i++) {
        if (!this.active[i]) continue;
        const b = B[i], o = i * 3;
        this.previous[o] = b.x; this.previous[o + 1] = b.y; this.previous[o + 2] = b.z;
        if (tmin > 0) advance(b, tmin, G.cloth);
      }
      const start = this.t;
      this.t += tmin;
      rem -= tmin;
      // Pocket/drop decisions precede collisions at the end of this segment.
      this.capture(start, tmin);
      this.detectLeaving();
      if ((i0 >= 0 && !B[i0].on) || (kind === 1 && !B[i1].on)) {
        if (rem > 0) continue;
        break;
      }
      if (kind === 1) {
        const j = ballBall(B[i0], B[i1]);
        if (j > 0) this.events.push({ k: "ball", t: this.t, a: B[i0].id, b: B[i1].id, j });
      } else if (kind === 2) {
        const a = B[i0], s = G.segments[i1];
        const vn = a.vx * s.nx + a.vy * s.ny;
        const high = a.z > RAIL_CLEAR;
        const facing = s.jaw;
        const j = ballRail(a, s.nx, s.ny, facing !== undefined ? E_JAW : high ? 0.32 : G.cloth.eCushion);
        if (j > 0) {
          // Hitting the top of the cushion kicks the ball down and back onto the slate instead of over the rail.
          if (high && facing === undefined) a.vz = Math.min(a.vz, -Math.max(0.15, -vn * 0.45));
          if (facing !== undefined) this.events.push({ k: "jaw", t: this.t, a: a.id, p: facing, j, x: a.x - s.nx * R, y: a.y - s.ny * R });
          else this.events.push({ k: "rail", t: this.t, a: a.id, j, x: a.x - s.nx * R, y: a.y - s.ny * R });
        }
      } else if (kind === 3) {
        const a = B[i0], p = G.points[i1];
        const dx = a.x - p.x, dy = a.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const vn = (a.vx * dx + a.vy * dy) / d;
        const high = a.z > RAIL_CLEAR;
        const j = ballRail(a, dx / d, dy / d, high ? 0.32 : G.cloth.eCushion);
        if (j > 0) {
          if (high) a.vz = Math.min(a.vz, -Math.max(0.15, -vn * 0.45));
          this.events.push({ k: "rail", t: this.t, a: a.id, j, x: a.x - (dx / d) * R, y: a.y - (dy / d) * R });
        }
      } else if (kind === 4) {
        const a = B[i0], jw = this.jaws[i1];
        const j = ballJaw(a, jw);
        if (j > 0) this.events.push({ k: "jaw", t: this.t, a: a.id, p: jw.p, j, x: jw.x, y: jw.y });
      }
      if (kind === 0) break;
    }
    // A degenerate overlap can repeat a zero-time collision. After the bounded collision budget, consume the
    // remainder deterministically so one malformed or numerically pathological rack cannot hang the server.
    if (rem > 0) {
      const start = this.t;
      for (let i = 0; i < B.length; i++) {
        const b = B[i], o = i * 3;
        this.previous[o] = b.x; this.previous[o + 1] = b.y; this.previous[o + 2] = b.z;
        this.active[i] = moving(b) ? 1 : 0;
        if (this.active[i]) advance(b, rem, G.cloth);
      }
      this.t += rem;
      this.capture(start, rem);
      this.detectLeaving();
    }
    if (!B.some(moving) || this.t > MAX_SIM_TIME) {
      for (const b of B) {
        b.vx = 0;
        b.vy = 0;
        b.wx = 0;
        b.wy = 0;
        b.wz = 0;
        b.z = 0;
        b.vz = 0;
      }
      this.done = true;
    }
  }

  run(): void {
    while (!this.done) this.step();
  }

  /**
   * The visible ball overlaps the hole before its centre reaches the centre-radius boundary. The modest lip
   * allowance captures that overlap only after the jaw line; jaw collisions still reject wide approaches. Sweeping
   * the segment prevents a fast ball from tunnelling across the drop between fixed steps.
   */
  private capture(start: number, dt: number): void {
    const P = this.geo.pockets, insideX = this.geo.L / 2 - 0.2 - this.luck, insideY = this.geo.W / 2 - 0.2 - this.luck;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.on || !this.active[i]) continue;
      const o = i * 3, x = this.previous[o], y = this.previous[o + 1], z = this.previous[o + 2];
      // All six holes are at the table perimeter; the interior cannot intersect a drop.
      if (x > -insideX && x < insideX && b.x > -insideX && b.x < insideX &&
          y > -insideY && y < insideY && b.y > -insideY && b.y < insideY) continue;
      const dx = b.x - x, dy = b.y - y, dz = b.z - z;
      let best = INF, which = -1;
      for (let k = 0; k < P.length; k++) {
        const p = P[k], rr = p.hr + 0.25 * R + this.luck;
        if (Math.min(x, b.x) > p.hx + rr || Math.max(x, b.x) < p.hx - rr ||
            Math.min(y, b.y) > p.hy + rr || Math.max(y, b.y) < p.hy - rr) continue;
        let u = circleEntry(x, y, dx, dy, p.hx, p.hy, rr);
        if (u === INF) continue;
        const s = (x - p.x) * p.dx + (y - p.y) * p.dy;
        const ds = dx * p.dx + dy * p.dy;
        if (s + u * ds < 0) {
          if (ds <= 0) continue;
          u = Math.max(u, -s / ds);
        }
        if (z + u * dz > POCKET_CLEAR) {
          if (dz >= 0) continue;
          u = Math.max(u, (POCKET_CLEAR - z) / dz);
        }
        if (u > 1 || u >= best) continue;
        const ex = x + u * dx - p.hx, ey = y + u * dy - p.hy;
        if (ex * ex + ey * ey > rr * rr + 1e-14) continue;
        best = u;
        which = k;
      }
      if (which < 0) continue;
      b.x = x + best * dx;
      b.y = y + best * dy;
      this.remove(b);
      this.events.push({ k: "pocket", t: start + best * dt, a: b.id, p: which });
    }
  }

  private remove(b: Ball): void {
    b.on = false;
    b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = b.z = 0;
  }

  private detectLeaving(): void {
    const g = this.geo, hx = g.L / 2, hy = g.W / 2;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      if (!b.on || !this.active[i]) continue;
      if (!this.jumped[i] && b.z >= JUMP_HEIGHT) {
        this.jumped[i] = 1;
        this.events.push({ k: "jump", t: this.t, a: b.id, x: b.x, y: b.y });
      }
      const beyondRail = Math.abs(b.x) > hx + RAIL_WIDTH + R || Math.abs(b.y) > hy + RAIL_WIDTH + R;
      const landedOutside = b.z === 0 && (Math.abs(b.x) > hx + R || Math.abs(b.y) > hy + R);
      if (!beyondRail && !landedOutside) continue;
      // A grounded ball in a pocket throat has not left the table; give it room to reach the drop.
      const inMouth = !beyondRail && g.pockets.some((p) => {
        const x = b.x - p.x, y = b.y - p.y, s = x * p.dx + y * p.dy;
        const lat = Math.abs(x * p.dy - y * p.dx);
        return s >= -p.funnel - R && s <= p.depth + R && lat <= p.mouthHalf + R;
      });
      if (inMouth) continue;
      const x = b.x, y = b.y;
      this.remove(b);
      this.events.push({ k: "off", t: this.t, a: b.id, x, y });
    }
  }
}
