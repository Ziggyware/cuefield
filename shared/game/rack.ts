import type { Mode } from "../catalog.ts";
import { R } from "../physics/constants.ts";
import type { Ball } from "../physics/types.ts";

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export const ball = (id: number, x: number, y: number, on = true): Ball => ({ id, x, y, z: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, on });

const ROWS: Record<Mode, number[]> = { 8: [1, 2, 3, 4, 5], 9: [1, 2, 3, 2, 1], 10: [1, 2, 3, 4], 15: [1, 2, 3, 4, 5] };

export function rack(mode: Mode, L: number, seed: number): Ball[] {
  const r = rng(seed);
  const d = 2 * R + 2e-5;
  const h = (d * Math.sqrt(3)) / 2;
  const fx = L / 4;
  const slots: [number, number][] = [];
  ROWS[mode].forEach((n, i) => {
    for (let j = 0; j < n; j++) slots.push([fx + i * h, (j - (n - 1) / 2) * d]);
  });

  let order: number[];
  if (mode === 8) {
    const solids = shuffle([1, 2, 3, 4, 5, 6, 7], r);
    const stripes = shuffle([9, 10, 11, 12, 13, 14, 15], r);
    const flip = r() < 0.5;
    const cornerA = flip ? solids.pop()! : stripes.pop()!;
    const cornerB = flip ? stripes.pop()! : solids.pop()!;
    const rest = shuffle([...solids, ...stripes], r);
    order = [];
    for (let i = 0; i < 15; i++) {
      if (i === 4) order.push(8);
      else if (i === 10) order.push(cornerA);
      else if (i === 14) order.push(cornerB);
      else order.push(rest.pop()!);
    }
  } else if (mode === 15) {
    const rest = shuffle([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], r);
    order = slots.map((_, i) => (i === 0 ? 1 : i === 4 ? 15 : i === 10 ? 2 : i === 14 ? 3 : rest.pop()!));
  } else {
    const n = mode === 9 ? 9 : 10;
    const rest = shuffle(Array.from({ length: n - 2 }, (_, i) => i + 2), r);
    order = slots.map((_, i) => (i === 0 ? 1 : i === 4 ? n : rest.pop()!));
  }

  const balls: Ball[] = [ball(0, -L / 4, 0)];
  slots.forEach(([x, y], i) => {
    balls.push(ball(order[i], x + (r() - 0.5) * 2e-5, y + (r() - 0.5) * 2e-5));
  });
  balls.sort((a, b) => a.id - b.id);
  return balls;
}

export function respot(balls: Ball[], b: Ball, L: number): void {
  const free = (x: number) => balls.every((o) => o === b || !o.on || (o.x - x) * (o.x - x) + o.y * o.y >= 4 * R * R);
  const step = 2 * R + 1e-4;
  let x = L / 4;
  while (x < L / 2 - R && !free(x)) x += step;
  if (x >= L / 2 - R) {
    x = L / 4;
    while (!free(x)) x -= step;
  }
  b.x = x;
  b.y = 0;
  b.z = 0;
  b.on = true;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.wx = 0;
  b.wy = 0;
  b.wz = 0;
}
