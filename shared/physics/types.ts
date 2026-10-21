export interface Ball {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
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

export interface Segment {
  ax: number;
  ay: number;
  nx: number;
  ny: number;
  tx: number;
  ty: number;
  len: number;
  /** Set on pocket facings: the pocket they belong to. Facings are dead and report jaw events. */
  jaw?: number;
}

/** Rounded pocket jaw tip. A ball touching it rattles instead of being swallowed. */
export interface Jaw {
  x: number;
  y: number;
  r: number;
}

export interface Pocket {
  /** Mouth centre on the jaw line, and the outward unit axis through it. */
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Mouth half-width between the jaw tips and the throat taper beyond it. */
  half: number;
  depth: number;
  taper: number;
  /** Drop-hole centre and radius: a ball centre inside this circle falls. */
  hx: number;
  hy: number;
  hr: number;
  /** Distance from the mouth centre to the drop-hole centre along the axis. */
  drop: number;
  /** Half-width and inward depth of the funnel between the cushion cut line and the jaw line (graphics). */
  mouthHalf: number;
  funnel: number;
  /** The two rounded jaw tips that frame the mouth. */
  jaws: [Jaw, Jaw];
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
  | { k: "jaw"; t: number; a: number; p: number; j: number; x: number; y: number }
  | { k: "pocket"; t: number; a: number; p: number };
