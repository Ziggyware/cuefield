/** Position m, velocity m/s, angular velocity rad/s (x, y horizontal, z vertical). */
export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  wx: number;
  wy: number;
  wz: number;
  on: boolean;
}

export interface Cloth {
  muSlide: number;
  muRoll: number;
  muSpin: number;
  eCushion: number;
}

/** Cushion line; n points into the playable side, t along A→B. */
export interface Segment {
  ax: number;
  ay: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  len: number;
}

/** Mouth midpoint, outward throat axis, mouth half width, capture depth, facing taper, drop-hole circle. */
export interface Pocket {
  x: number;
  y: number;
  dx: number;
  dy: number;
  half: number;
  depth: number;
  taper: number;
  hx: number;
  hy: number;
  hr: number;
}

export interface Geometry {
  L: number;
  W: number;
  segments: Segment[];
  points: { x: number; y: number }[];
  pockets: Pocket[];
  cloth: Cloth;
}

export type SimEvent =
  | { k: "ball"; t: number; a: number; b: number; j: number }
  | { k: "rail"; t: number; a: number; j: number }
  | { k: "pocket"; t: number; a: number; p: number };
