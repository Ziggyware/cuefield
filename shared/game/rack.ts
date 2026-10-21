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

/**
 * Trick racks: creative practice setups, client-only. Deterministic per (shape, seed) so a failed trick can be
 * retried on exactly the same layout. Subset shapes never include the 8, so eight-ball cannot end by accident.
 */
export type RackShape = "wall" | "wedge" | "snake" | "ring" | "duo" | "solo";

export const RACK_SHAPES: { id: RackShape; name: string; note: string }[] = [
  { id: "wall", name: "the wall", note: "every ball in one frozen line across the foot — break it or bank over it" },
  { id: "wedge", name: "the wedge", note: "a V pointing away from you; the apex ball is the only clean first contact" },
  { id: "snake", name: "the snake", note: "a sine of balls down the table — thread the cue between the coils" },
  { id: "ring", name: "ouroboros", note: "a perfect ring with an empty heart; drop a ball through the eye" },
  { id: "duo", name: "frozen duo", note: "two balls frozen together against the rail — the classic duo bank" },
  { id: "solo", name: "lone wolf", note: "one ball, one pocket, long table — bank, massé or stun it home" },
];

export function shapeRack(mode: Mode, L: number, W: number, shape: RackShape, seed: number): Ball[] {
  const r = rng((seed ^ 0x5eed) >>> 0);
  const d = 2 * R + 2e-5;
  const full = mode === 9 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : mode === 10 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const ids = shape === "duo" ? [1, 9] : shape === "solo" ? [1] : full;
  const n = ids.length;
  const j = () => (r() - 0.5) * 2e-5;
  const pts: [number, number][] = [];
  const hw = W / 2 - R - 1e-4;

  if (shape === "wall") {
    for (let i = 0; i < n; i++) pts.push([L / 4, (i - (n - 1) / 2) * d]);
  } else if (shape === "wedge") {
    // Apex nearest the cue ball, arms opening toward the foot rail. At ±32° the mirrored arms stay a full
    // ball-width apart at every index, so nothing overlaps.
    const a = (32 * Math.PI) / 180, per = Math.ceil((n - 1) / 2);
    pts.push([L / 4, 0]);
    for (let arm = -1; arm <= 1; arm += 2) {
      const count = arm < 0 ? per : n - 1 - per;
      for (let i = 1; i <= count; i++) pts.push([L / 4 + i * d * Math.cos(a), arm * i * d * Math.sin(a)]);
    }
  } else if (shape === "snake") {
    for (let i = 0; i < n; i++) {
      const x = ((i / (n - 1)) * 2 - 1) * 0.34 * L;
      pts.push([x, Math.sin(i * 1.15) * Math.min(hw - d, 0.28 * W)]);
    }
  } else if (shape === "ring") {
    const rad = d / (2 * Math.sin(Math.PI / n)) + 1e-5;
    for (let i = 0; i < n; i++) pts.push([L / 4 + Math.cos((2 * Math.PI * i) / n) * rad, Math.sin((2 * Math.PI * i) / n) * rad]);
  } else if (shape === "duo") {
    pts.push([L / 4, hw], [L / 4, hw - d]);
  } else {
    pts.push([L / 4 + (r() - 0.5) * 0.2 * L, (r() - 0.5) * 2 * (hw - d)]);
  }

  // Keep every ball on the cloth.
  const balls: Ball[] = [ball(0, -L / 4, shape === "solo" ? 0.16 * W : 0)];
  pts.forEach(([x, y], i) => {
    const cx = Math.max(-L / 2 + R + 1e-4, Math.min(L / 2 - R - 1e-4, x));
    const cy = Math.max(-hw, Math.min(hw, y));
    balls.push(ball(ids[i], cx + j(), cy + j()));
  });
  balls.sort((a, b) => a.id - b.id);
  return balls;
}
