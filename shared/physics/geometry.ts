import type { TableSpec } from "../catalog.ts";
import { R } from "./constants.ts";
import type { Geometry, Pocket, Segment } from "./types.ts";

/**
 * Jaw facings: corner facings are cut at 142° to the cushion (7° off the pocket axis), side facings at 104°
 * (14° off the axis), so each throat narrows away from the mouth. Trig values are literals for determinism.
 */
const COS38 = 0.788010753606722, SIN38 = 0.6156614753256583, TAN7 = 0.12278456090290459;
const COS14 = 0.9702957262759965, SIN14 = 0.24192189559966773, TAN14 = 0.24932800284318068;
const CORNER_FACING = 2.6 * R, SIDE_FACING = 2.0 * R;

/** Drop hole centred on the throat axis where the facings end; radius spans the throat there. */
function pocket(x: number, y: number, dx: number, dy: number, half: number, depth: number, taper: number, k: number): Pocket {
  const s = k * half;
  return { x, y, dx, dy, half, depth, taper, hx: x + dx * s, hy: y + dy * s, hr: half - s * taper + 0.1 * R };
}

function seg(out: Segment[], ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const tx = dx / len, ty = dy / len;
  let nx = -ty, ny = tx;
  if ((cx - ax) * nx + (cy - ay) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  out.push({ ax, ay, nx, ny, tx, ty, len });
}

/** Origin at table centre, x along the long axis, head rail at −x. (cx, cy) is a point on the side the normal must face. */
export function buildGeometry(t: TableSpec): Geometry {
  const hl = t.L / 2, hw = t.W / 2;
  const q = t.corner / Math.SQRT2;
  const sm = t.side / 2;
  const s: Segment[] = [];
  const pockets: Pocket[] = [];

  for (const sy of [1, -1]) {
    seg(s, -hl + q, sy * hw, -sm, sy * hw, 0, 0);
    seg(s, sm, sy * hw, hl - q, sy * hw, 0, 0);
  }
  for (const sx of [1, -1]) seg(s, sx * hl, -hw + q, sx * hl, hw - q, 0, 0);

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const dx = sx / Math.SQRT2, dy = sy / Math.SQRT2;
      const p1x = sx * (hl - q), p1y = sy * hw;
      const p2x = sx * hl, p2y = sy * (hw - q);
      const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
      seg(s, p1x, p1y, p1x + sx * COS38 * CORNER_FACING, p1y + sy * SIN38 * CORNER_FACING, mx, my);
      seg(s, p2x, p2y, p2x + sx * SIN38 * CORNER_FACING, p2y + sy * COS38 * CORNER_FACING, mx, my);
      pockets.push(pocket(mx, my, dx, dy, t.corner / 2, 0.45 * R, TAN7, 0.95));
    }
  }

  for (const sy of [-1, 1]) {
    for (const sx of [-1, 1]) {
      const px = sx * sm, py = sy * hw;
      seg(s, px, py, px - sx * SIN14 * SIDE_FACING, py + sy * COS14 * SIDE_FACING, 0, py + sy * R);
    }
    pockets.push(pocket(0, sy * hw, 0, sy, t.side / 2, 0.7 * R, TAN14, 0.8));
  }

  const points: { x: number; y: number }[] = [];
  for (const g of s) {
    points.push({ x: g.ax, y: g.ay });
    points.push({ x: g.ax + g.tx * g.len, y: g.ay + g.ty * g.len });
  }

  return {
    L: t.L,
    W: t.W,
    segments: s,
    points,
    pockets,
    cloth: { muSlide: t.muSlide, muRoll: t.muRoll, muSpin: t.muSpin, eCushion: t.eCushion },
  };
}
