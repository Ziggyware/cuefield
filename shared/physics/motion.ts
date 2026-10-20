import { EPS_V, G, R, SPIN_K } from "./constants.ts";
import type { Ball, Cloth } from "./types.ts";

/** Contact-point slip u = v + ω × (−R ẑ). */
export function slip(b: Ball): number {
  const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
  return Math.sqrt(ux * ux + uy * uy);
}

export function moving(b: Ball): boolean {
  if (!b.on) return false;
  if (b.vx * b.vx + b.vy * b.vy > EPS_V * EPS_V) return true;
  return slip(b) > EPS_V;
}

function decaySpin(b: Ball, h: number, c: Cloth) {
  const d = SPIN_K * c.muSpin * G * h;
  if (b.wz > d) b.wz -= d;
  else if (b.wz < -d) b.wz += d;
  else b.wz = 0;
}

/**
 * Exact piecewise motion under Coulomb cloth friction.
 * Sliding: u̇ = −(7/2) μs g û with fixed direction, so the phase lasts |u|/(3.5 μs g).
 * Rolling: constant deceleration μr g, ω locked to v.
 */
export function advance(b: Ball, h: number, c: Cloth): void {
  let rem = h;
  for (let guard = 0; guard < 4 && rem > 0; guard++) {
    const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
    const us = Math.sqrt(ux * ux + uy * uy);
    if (us > EPS_V) {
      const ts = us / (3.5 * c.muSlide * G);
      const ends = ts <= rem;
      const dt = ends ? ts : rem;
      const ex = ux / us, ey = uy / us;
      const a = c.muSlide * G;
      b.x += b.vx * dt - 0.5 * a * ex * dt * dt;
      b.y += b.vy * dt - 0.5 * a * ey * dt * dt;
      b.vx -= a * ex * dt;
      b.vy -= a * ey * dt;
      const k = SPIN_K * a * dt;
      b.wx -= k * ey;
      b.wy += k * ex;
      if (ends) {
        b.wx = -b.vy / R;
        b.wy = b.vx / R;
      }
      decaySpin(b, dt, c);
      rem -= dt;
      continue;
    }
    const s = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (s > EPS_V) {
      const a = c.muRoll * G;
      const tr = s / a;
      const stops = tr <= rem;
      const dt = stops ? tr : rem;
      const ex = b.vx / s, ey = b.vy / s;
      const d = s * dt - 0.5 * a * dt * dt;
      b.x += ex * d;
      b.y += ey * d;
      const ns = stops ? 0 : s - a * dt;
      b.vx = ex * ns;
      b.vy = ey * ns;
      b.wx = -b.vy / R;
      b.wy = b.vx / R;
      decaySpin(b, dt, c);
      rem -= dt;
      continue;
    }
    b.vx = 0;
    b.vy = 0;
    b.wx = 0;
    b.wy = 0;
    decaySpin(b, rem, c);
    rem = 0;
  }
}
