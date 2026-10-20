import type { CueSpec } from "../catalog.ts";
import { INERTIA, MASS, R } from "./constants.ts";
import type { Ball } from "./types.ts";

/** Quantised shot input. dx, dy: aim ×1e6. power: 1..1000. tx, ty: tip offset ±1000 of the cue's spin limit (ty up). el: tan(θ/2)×1e4. */
export interface StrikeInput {
  dx: number;
  dy: number;
  power: number;
  tx: number;
  ty: number;
  el: number;
}

export function clampInput(i: StrikeInput, cue: CueSpec): StrikeInput {
  const r = Math.sqrt(i.tx * i.tx + i.ty * i.ty);
  const k = r > 1000 ? 1000 / r : 1;
  return {
    dx: Math.round(i.dx),
    dy: Math.round(i.dy),
    power: Math.max(1, Math.min(1000, Math.round(i.power))),
    tx: Math.round(i.tx * k),
    ty: Math.round(i.ty * k),
    el: Math.max(0, Math.min(cue.elev, Math.round(i.el))),
  };
}

/**
 * Cue–ball impact as a point impulse along the cue axis d at Q = a ŝ + b û − c d̂ (|Q| = R).
 * F = (1+e)V / (1/M + 1/m + (a²+b²)/I); Δv = F d_h/m (vertical part absorbed by the slate); Δω = F (Q × d)/I.
 * Squirt (Alciatore): tan α = (5/2)(a/R)√(1−(a/R)²) / (1 + m/mₑ + (5/2)(1−(a/R)²)), deflecting away from the english.
 * Elevation uses the rational parametrisation sin θ = 2t/(1+t²), cos θ = (1−t²)/(1+t²) to stay trig-free.
 * wobble: stroke aim error as tan(φ/2), applied as the same rational rotation of the aim before squirt.
 */
export function strike(cueBall: Ball, raw: StrikeInput, cue: CueSpec, wobble = 0): void {
  const inp = clampInput(raw, cue);
  const hn = Math.sqrt(inp.dx * inp.dx + inp.dy * inp.dy);
  let hx = inp.dx / hn, hy = inp.dy / hn;
  if (wobble !== 0) {
    const w2 = wobble * wobble, c0 = (1 - w2) / (1 + w2), s0 = (2 * wobble) / (1 + w2);
    const rx = hx * c0 - hy * s0;
    hy = hx * s0 + hy * c0;
    hx = rx;
  }
  const a = (inp.tx / 1000) * cue.spin * R;
  const b = (inp.ty / 1000) * cue.spin * R;
  const t = inp.el / 10000;
  const sinT = (2 * t) / (1 + t * t);
  const cosT = (1 - t * t) / (1 + t * t);

  const ar = a / R;
  const rest = 1 - ar * ar;
  const tanA = (2.5 * ar * Math.sqrt(rest)) / (1 + MASS / cue.endMass + 2.5 * rest);
  const sx0 = hy, sy0 = -hx;
  const qx = hx - tanA * sx0, qy = hy - tanA * sy0;
  const qn = Math.sqrt(qx * qx + qy * qy);
  hx = qx / qn;
  hy = qy / qn;

  const sx = hy, sy = -hx;
  const dx = hx * cosT, dy = hy * cosT, dz = -sinT;
  let ux = sy * dz, uy = -sx * dz, uz = sx * dy - sy * dx;
  const un = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= un;
  uy /= un;
  uz /= un;
  if (uz < 0) {
    ux = -ux;
    uy = -uy;
    uz = -uz;
  }
  const c = Math.sqrt(R * R - a * a - b * b);
  const Qx = a * sx + b * ux - c * dx;
  const Qy = a * sy + b * uy - c * dy;
  const Qz = b * uz - c * dz;

  const V = cue.speed * (inp.power / 1000);
  const F = ((1 + cue.tipE) * V) / (1 / cue.mass + 1 / MASS + (a * a + b * b) / INERTIA);
  cueBall.vx = (F * dx) / MASS;
  cueBall.vy = (F * dy) / MASS;
  cueBall.wx = (F * (Qy * dz - Qz * dy)) / INERTIA;
  cueBall.wy = (F * (Qz * dx - Qx * dz)) / INERTIA;
  cueBall.wz = (F * (Qx * dy - Qy * dx)) / INERTIA;
}
