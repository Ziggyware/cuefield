import { ballBall, ballJaw, ballRail } from "./collide.ts";
import { DT, EPS_V, E_JAW, MAX_SIM_TIME, POCKET_CLEAR, R, RAIL_CLEAR } from "./constants.ts";
import { advance, slip } from "./motion.ts";
import { Sim } from "./sim.ts";
import type { Ball, Segment } from "./types.ts";

const INF = Number.POSITIVE_INFINITY;
const D2 = 4 * R * R;

function toiBall(a: Ball, b: Ball, lim: number): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const vx = b.vx - a.vx, vy = b.vy - a.vy, vz = b.vz - a.vz;
  const bq = dx * vx + dy * vy + dz * vz;
  if (bq >= 0) return INF;
  const c = dx * dx + dy * dy + dz * dz - D2;
  if (c <= 0) return 0;
  const aq = vx * vx + vy * vy + vz * vz;
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

/** Time to touch a fixed round post of radius `rad` (0 for the sharp cushion joints). */
function toiPost(a: Ball, px: number, py: number, rad: number, lim: number): number {
  const dx = a.x - px, dy = a.y - py;
  const bq = dx * a.vx + dy * a.vy;
  if (bq >= 0) return INF;
  const c = dx * dx + dy * dy - (R + rad) * (R + rad);
  if (c <= 0) return 0;
  const aq = a.vx * a.vx + a.vy * a.vy;
  const disc = bq * bq - aq * c;
  if (disc < 0) return INF;
  const t = (-bq - Math.sqrt(disc)) / aq;
  return t < lim ? t : INF;
}

// Frozen version-one physics for matches and shot logs saved before the pocket/accuracy update.
// Keep its arithmetic and event order unchanged: historic server/client replays depend on bit-identical results.
function moving(b: Ball): boolean {
  if (!b.on) return false;
  if (b.vx * b.vx + b.vy * b.vy > EPS_V * EPS_V) return true;
  if (b.z > 0 || Math.abs(b.vz) > EPS_V) return true;
  return slip(b) > EPS_V;
}

export class LegacySim extends Sim {
  override step(): void {
    if (this.done) return;
    const B = this.balls, G = this.geo;
    let rem = DT;
    for (let guard = 0; guard < 96 && rem > 0; guard++) {
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
      if (tmin > 0) for (const b of B) if (moving(b)) advance(b, tmin, G.cloth);
      this.t += tmin;
      rem -= tmin;
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
      this.captureLegacy();
      if (kind === 0) break;
    }
    // Only reached when old physics would otherwise loop forever on zero-time collisions.
    if (rem > 0) {
      for (const b of B) if (moving(b)) advance(b, rem, G.cloth);
      this.t += rem;
      this.captureLegacy();
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

  override run(): void {
    while (!this.done) this.step();
  }

  /**
   * A ball falls only when its centre is inside the drop circle beyond the jaw line. The mouth itself is not a
   * capture volume: a ball that clips a jaw or crosses the mouth wide is rejected by the jaw impulses first, and a
   * ball flying over the pocket stays on the table.
   */
  private captureLegacy(): void {
    const P = this.geo.pockets;
    for (const b of this.balls) {
      if (!b.on || b.z > POCKET_CLEAR) continue;
      for (let k = 0; k < P.length; k++) {
        const p = P[k];
        const rx = b.x - p.x, ry = b.y - p.y;
        const s = rx * p.dx + ry * p.dy;
        if (s < 0) continue;
        const lat = rx * p.dy - ry * p.dx;
        if (lat > p.half + this.luck || lat < -p.half - this.luck) continue;
        const ex = rx - p.dx * p.drop, ey = ry - p.dy * p.drop;
        const rr = p.hr + this.luck;
        if (ex * ex + ey * ey > rr * rr) continue;
        b.on = false;
        b.vx = 0;
        b.vy = 0;
        b.vz = 0;
        b.z = 0;
        b.wx = 0;
        b.wy = 0;
        b.wz = 0;
        this.events.push({ k: "pocket", t: this.t, a: b.id, p: k });
        break;
      }
    }
  }
}
