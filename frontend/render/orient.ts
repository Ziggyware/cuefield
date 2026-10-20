import type { Ball } from "../../shared/physics/types.ts";

/** Render-only ball orientations: 3×3 rotation per ball id (columns = local axes in world), integrated from ω. */
export class Orient {
  m = new Float32Array(16 * 9);

  constructor() {
    for (let id = 0; id < 16; id++) {
      const a = id * 2.399963, b = id * 1.1 + 0.4, c = id * 0.7;
      this.m.set([1, 0, 0, 0, 1, 0, 0, 0, 1], id * 9);
      this.rotate(id, Math.cos(a), Math.sin(a), 0.3, b);
      this.rotate(id, 0, 0, 1, c);
      if (id > 0) this.rotate(id, 0, 1, 0, 0.35);
    }
  }

  /** Rodrigues rotation of all three basis columns about unit-normalised (x, y, z) by angle t. */
  rotate(id: number, x: number, y: number, z: number, t: number): void {
    const n = Math.hypot(x, y, z);
    if (n < 1e-12 || t === 0) return;
    x /= n;
    y /= n;
    z /= n;
    const c = Math.cos(t), s = Math.sin(t), k = 1 - c;
    const r00 = c + x * x * k, r01 = x * y * k - z * s, r02 = x * z * k + y * s;
    const r10 = y * x * k + z * s, r11 = c + y * y * k, r12 = y * z * k - x * s;
    const r20 = z * x * k - y * s, r21 = z * y * k + x * s, r22 = c + z * z * k;
    const m = this.m, o = id * 9;
    for (let col = 0; col < 3; col++) {
      const i = o + col * 3;
      const vx = m[i], vy = m[i + 1], vz = m[i + 2];
      m[i] = r00 * vx + r01 * vy + r02 * vz;
      m[i + 1] = r10 * vx + r11 * vy + r12 * vz;
      m[i + 2] = r20 * vx + r21 * vy + r22 * vz;
    }
  }

  advance(balls: Ball[], dt: number): void {
    for (const b of balls) {
      if (!b.on) continue;
      const w = Math.hypot(b.wx, b.wy, b.wz);
      if (w > 1e-6) this.rotate(b.id, b.wx, b.wy, b.wz, w * dt);
    }
  }
}
