import { E_BALL, EPS_V, INERTIA, MASS, MU_BALL, MU_CUSHION, NOSE_COS, NOSE_SIN, R } from "./constants.ts";
import type { Ball } from "./types.ts";

/**
 * Ball–ball impulse. Normal: restitution e along the line of centres.
 * Tangential: Coulomb friction on contact slip v₁−v₂+R(ω₁+ω₂)×n̂ (cut-induced and spin-induced throw),
 * capped at the sticking impulse |s|·m/7 (each ball's tangential inverse mass is 7/2m).
 */
export function ballBall(a: Ball, b: Ball): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  const nx = dx / d, ny = dy / d;
  const rvx = a.vx - b.vx, rvy = a.vy - b.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn <= 0) return 0;
  const sx = a.wx + b.wx, sy = a.wy + b.wy, sz = a.wz + b.wz;
  const cx = rvx - R * sz * ny;
  const cy = rvy + R * sz * nx;
  const cz = R * (sx * ny - sy * nx);
  const cn = cx * nx + cy * ny;
  const tx = cx - cn * nx, ty = cy - cn * ny, tz = cz;
  const jn = 0.5 * (1 + E_BALL) * MASS * vn;
  a.vx -= (jn / MASS) * nx;
  a.vy -= (jn / MASS) * ny;
  b.vx += (jn / MASS) * nx;
  b.vy += (jn / MASS) * ny;
  const ts = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (ts > EPS_V) {
    const jt = Math.min(MU_BALL * jn, (ts * MASS) / 7);
    const ex = tx / ts, ey = ty / ts, ez = tz / ts;
    a.vx -= (jt * ex) / MASS;
    a.vy -= (jt * ey) / MASS;
    b.vx += (jt * ex) / MASS;
    b.vy += (jt * ey) / MASS;
    const k = (jt * R) / INERTIA;
    const qx = ny * ez, qy = -nx * ez, qz = nx * ey - ny * ex;
    a.wx -= k * qx;
    a.wy -= k * qy;
    a.wz -= k * qz;
    b.wx -= k * qx;
    b.wy -= k * qy;
    b.wz -= k * qz;
  }
  return jn;
}

/**
 * Ball–cushion impulse. Contact at the nose r_c = R(−n̂ cos φ + ẑ sin φ). The normal impulse acts along
 * the contact→centre line (no torque about the centre); its horizontal part reverses vₙ with restitution e.
 * Friction opposes contact-point slip (english and follow/draw change the rebound), Coulomb-capped.
 */
export function ballRail(b: Ball, nx: number, ny: number, e: number): number {
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  const rcx = -R * NOSE_COS * nx, rcy = -R * NOSE_COS * ny, rcz = R * NOSE_SIN;
  const P = (-(1 + e) * MASS * vn) / NOSE_COS;
  const vcx = b.vx + (b.wy * rcz - b.wz * rcy);
  const vcy = b.vy + (b.wz * rcx - b.wx * rcz);
  const vcz = b.wx * rcy - b.wy * rcx;
  const Nx = nx * NOSE_COS, Ny = ny * NOSE_COS, Nz = -NOSE_SIN;
  const dn = vcx * Nx + vcy * Ny + vcz * Nz;
  const sx = vcx - dn * Nx, sy = vcy - dn * Ny, sz = vcz - dn * Nz;
  b.vx += (P * Nx) / MASS;
  b.vy += (P * Ny) / MASS;
  const ss = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (ss > EPS_V) {
    const ex = sx / ss, ey = sy / ss, ez = sz / ss;
    const qx = rcy * ez - rcz * ey, qy = rcz * ex - rcx * ez, qz = rcx * ey - rcy * ex;
    const kinv = 1 / MASS + (qx * qx + qy * qy + qz * qz) / INERTIA;
    const jt = Math.min(MU_CUSHION * P, ss / kinv);
    b.vx -= (jt * ex) / MASS;
    b.vy -= (jt * ey) / MASS;
    b.wx -= (jt / INERTIA) * qx;
    b.wy -= (jt / INERTIA) * qy;
    b.wz -= (jt / INERTIA) * qz;
  }
  return P;
}
