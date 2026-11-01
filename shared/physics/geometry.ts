import type { TableSpec } from "../catalog.ts";
import { R } from "./constants.ts";
import type { Geometry, Jaw, Pocket, Segment } from "./types.ts";

/**
 * Jaw facings: corner facings are cut at 142° to the cushion (7° off the pocket axis), side facings at 104°
 * (14° off the axis), so each throat narrows away from the mouth. Trig values are literals for determinism.
 */
const COS38 = 0.788010753606722, SIN38 = 0.6156614753256583, TAN7 = 0.12278456090290459;
const COS14 = 0.9702957262759965, SIN14 = 0.24192189559966773, TAN14 = 0.24932800284318068;
const CORNER_FACING = 2.6 * R, SIDE_FACING = 2.0 * R;

/**
 * Pocket built from its two rounded jaw tips: the mouth is the segment between them, the throat tapers outward and
 * the drop hole sits beyond the jaw line. `drop` and `hr` are sized from the mouth so that a ball must pass the jaws
 * before it can fall, which is what makes jaw hits reject and rattle.
 */
function pocket(a: Jaw, b: Jaw, m: { x: number; y: number }, mouthHalf: number, dx: number, dy: number, taper: number): Pocket {
  const jx = b.x - a.x, jy = b.y - a.y;
  const half = 0.5 * Math.sqrt(jx * jx + jy * jy);
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  const funnel = -((m.x - x) * dx + (m.y - y) * dy);
  const drop = 0.6 * half + 0.5 * R;
  const hr = 0.72 * half;
  return {
    x,
    y,
    dx,
    dy,
    half,
    depth: drop + hr,
    taper,
    hx: x + dx * drop,
    hy: y + dy * drop,
    hr,
    drop,
    mouthHalf,
    funnel,
    jaws: [a, b],
  };
}

function seg(out: Segment[], ax: number, ay: number, bx: number, by: number, cx: number, cy: number, jaw?: number) {
  const dx = bx - ax, dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  const tx = dx / len, ty = dy / len;
  let nx = -ty, ny = tx;
  if ((cx - ax) * nx + (cy - ay) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  out.push(jaw === undefined ? { ax, ay, nx, ny, tx, ty, len } : { ax, ay, nx, ny, tx, ty, len, jaw });
}

/** Origin at table centre, x along the long axis, head rail at −x. (cx, cy) is a point on the side the normal must face. */
export function buildGeometry(t: TableSpec): Geometry {
  const hl = t.L / 2, hw = t.W / 2;
  const q = t.corner / Math.SQRT2;
  const sm = t.side / 2;
  const s: Segment[] = [];
  const pockets: Pocket[] = [];
  /** Upright posts where a cushion meets a jaw facing: a ball caught on the joint is pushed clear. */
  const posts: { x: number; y: number }[] = [];

  for (const sy of [1, -1]) {
    seg(s, -hl + q, sy * hw, -sm, sy * hw, 0, 0);
    seg(s, sm, sy * hw, hl - q, sy * hw, 0, 0);
    posts.push({ x: -sm, y: sy * hw }, { x: sm, y: sy * hw });
  }
  for (const sx of [1, -1]) seg(s, sx * hl, -hw + q, sx * hl, hw - q, 0, 0);

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const dx = sx / Math.SQRT2, dy = sy / Math.SQRT2;
      const p1x = sx * (hl - q), p1y = sy * hw;
      const p2x = sx * hl, p2y = sy * (hw - q);
      const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
      const j1: Jaw = {
        x: p1x + sx * COS38 * CORNER_FACING,
        y: p1y + sy * SIN38 * CORNER_FACING,
        r: 0.3 * R,
      };
      const j2: Jaw = {
        x: p2x + sx * SIN38 * CORNER_FACING,
        y: p2y + sy * COS38 * CORNER_FACING,
        r: 0.3 * R,
      };
      const k = pockets.length;
      seg(s, p1x, p1y, j1.x, j1.y, mx, my, k);
      seg(s, p2x, p2y, j2.x, j2.y, mx, my, k);
      posts.push({ x: p1x, y: p1y }, { x: p2x, y: p2y });
      pockets.push(pocket(j1, j2, { x: mx, y: my }, t.corner / 2, dx, dy, TAN7));
    }
  }

  for (const sy of [-1, 1]) {
    const jaws: Jaw[] = [];
    const k = pockets.length;
    for (const sx of [-1, 1]) {
      const px = sx * sm, py = sy * hw;
      const j: Jaw = {
        x: px - sx * SIN14 * SIDE_FACING,
        y: py + sy * COS14 * SIDE_FACING,
        r: 0.3 * R,
      };
      seg(s, px, py, j.x, j.y, 0, py + sy * R, k);
      posts.push({ x: px, y: py });
      jaws.push(j);
    }
    pockets.push(pocket(jaws[0], jaws[1], { x: 0, y: sy * hw }, t.side / 2, 0, sy, TAN14));
  }

  return {
    L: t.L,
    W: t.W,
    segments: s,
    points: posts,
    pockets,
    cloth: { muSlide: t.muSlide, muRoll: t.muRoll, muSpin: t.muSpin, eCushion: t.eCushion },
  };
}
