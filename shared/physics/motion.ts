import { AIR_DRAG, AIR_SPIN, E_TABLE, EPS_V, G, R, REST_VZ, SPIN_K } from "./constants.ts";
import type { Ball, Cloth } from "./types.ts";

export function slip(b: Ball): number {
  const ux = b.vx - R * b.wy, uy = b.vy + R * b.wx;
  return Math.sqrt(ux * ux + uy * uy);
}

export function moving(b: Ball): boolean {
  if (!b.on) return false;
  if (b.vx * b.vx + b.vy * b.vy > EPS_V * EPS_V) return true;
  if (b.z > 0 || Math.abs(b.vz) > EPS_V) return true;
  return slip(b) > EPS_V;
}

function decaySpin(b: Ball, h: number, c: Cloth) {
  const d = SPIN_K * c.muSpin * G * h;
  if (b.wz > d) b.wz -= d;
  else if (b.wz < -d) b.wz += d;
  else b.wz = 0;
}

/** Cloth contact: sliding then rolling, exactly integrated over the remaining step. */
function cloth(b: Ball, rem: number, c: Cloth): number {
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
  return rem;
}

/**
 * Ballistic hop. Air resistance is the only horizontal force in the air, so a jumping ball keeps its line; the
 * landing applies the slate restitution and a small tangential loss, after which the cloth model takes over.
 */
function flight(b: Ball, h: number): void {
  const drag = 1 - AIR_DRAG * h, sdrag = 1 - AIR_SPIN * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
  b.z += b.vz * h - 0.5 * G * h * h;
  b.vz -= G * h;
  b.vx *= drag;
  b.vy *= drag;
  b.wx *= sdrag;
  b.wy *= sdrag;
  b.wz *= sdrag;
  if (b.z > 0) return;
  const impact = -b.vz;
  b.z = 0;
  b.vz = impact > REST_VZ ? impact * E_TABLE : 0;
  const loss = 1 - 0.03 * Math.min(1.5, impact);
  b.vx *= loss;
  b.vy *= loss;
}

/**
 * Advance one ball over h ≤ one physics step. A raised ball is integrated ballistically: no cloth friction, no
 * rolling constraint, spin preserved apart from air drag. Only a ball resting on the slate sees sliding and rolling.
 */
export function advance(b: Ball, h: number, c: Cloth): void {
  if (b.z <= 0 && b.vz <= 0) {
    b.z = 0;
    b.vz = 0;
  }
  // A raised (or just-launched) ball is integrated ballistically for the whole interval; the cloth model resumes on
  // the next step so a landing never double-counts horizontal travel.
  if (b.z > 0 || b.vz > 0) {
    flight(b, h);
    return;
  }
  cloth(b, h, c);
}
