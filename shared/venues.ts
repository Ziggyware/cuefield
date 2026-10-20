/** Rules demanded at a venue; each tier adds to the one before. */
export interface Rules {
  /** The game ball (8, or the 9 when it is the object ball) must go in the called pocket. */
  callEight: boolean;
  /** After contact a ball must be pocketed or reach a cushion. */
  railRule: boolean;
  /** Break must pocket a ball or drive four balls to cushions. */
  breakRule: boolean;
  /** Every shot calls a pocket; the turn continues only when a legal ball drops in it. */
  callShot: boolean;
  /** Three successive fouls by one player lose the rack. */
  threeFoul: boolean;
  /** Shot clock, ms. */
  clock: number;
}

/** Prediction: 4 every ball to rest, 3 cue ball + first ball hit, 2 cue ball only, 1 none. */
export type AssistLevel = 1 | 2 | 3 | 4;

export const clampAssist = (v: unknown, max: AssistLevel = 4): AssistLevel => Math.max(1, Math.min(max, Math.round(Number(v)) || max)) as AssistLevel;

/** L, W: playing surface m. corner, side: pocket mouth m. Cloth coefficients dimensionless. fee: entry per player. */
export interface TableSpec {
  id: string;
  name: string;
  tier: number;
  fee: number;
  assist: AssistLevel;
  rules: Rules;
  L: number;
  W: number;
  corner: number;
  side: number;
  muSlide: number;
  muRoll: number;
  muSpin: number;
  eCushion: number;
  cloth: [number, number, number];
  rail: [number, number, number];
  sight: [number, number, number];
}

const R = (callEight: boolean, railRule: boolean, breakRule: boolean, callShot: boolean, threeFoul: boolean, clock: number): Rules => ({
  callEight,
  railRule,
  breakRule,
  callShot,
  threeFoul,
  clock,
});
type Cloth = Pick<TableSpec, "L" | "W" | "corner" | "side" | "muSlide" | "muRoll" | "muSpin" | "eCushion" | "cloth" | "rail" | "sight">;
const T = (id: string, name: string, tier: number, fee: number, assist: AssistLevel, rules: Rules, c: Cloth): TableSpec => ({
  id,
  name,
  tier,
  fee,
  assist,
  rules,
  ...c,
});

export const TABLES: TableSpec[] = [
  T("garage", "The Garage", 1, 0, 4, R(false, false, false, false, false, 45_000), {
    L: 1.981,
    W: 0.991,
    corner: 0.1175,
    side: 0.130,
    muSlide: 0.21,
    muRoll: 0.013,
    muSpin: 0.050,
    eCushion: 0.76,
    cloth: [0.04, 0.50, 0.28],
    rail: [0.36, 0.20, 0.10],
    sight: [0.85, 0.82, 0.74],
  }),
  T("tavern", "Dockside Tavern", 2, 50, 4, R(true, false, false, false, false, 40_000), {
    L: 2.235,
    W: 1.118,
    corner: 0.1175,
    side: 0.130,
    muSlide: 0.20,
    muRoll: 0.011,
    muSpin: 0.046,
    eCushion: 0.78,
    cloth: [0.56, 0.06, 0.12],
    rail: [0.28, 0.14, 0.07],
    sight: [0.88, 0.80, 0.55],
  }),
  T("hall", "Union Hall", 3, 200, 3, R(true, true, true, false, false, 35_000), {
    L: 2.540,
    W: 1.270,
    corner: 0.1143,
    side: 0.127,
    muSlide: 0.20,
    muRoll: 0.010,
    muSpin: 0.044,
    eCushion: 0.80,
    cloth: [0.04, 0.33, 0.72],
    rail: [0.20, 0.12, 0.07],
    sight: [0.90, 0.90, 0.92],
  }),
  T("arena", "The Arena", 4, 1000, 2, R(true, true, true, true, false, 30_000), {
    L: 2.540,
    W: 1.270,
    corner: 0.1111,
    side: 0.124,
    muSlide: 0.18,
    muRoll: 0.009,
    muSpin: 0.042,
    eCushion: 0.82,
    cloth: [0.30, 0.33, 0.38],
    rail: [0.09, 0.09, 0.10],
    sight: [0.83, 1.00, 0.00],
  }),
  T("sanctum", "Sanctum", 5, 5000, 1, R(true, true, true, true, true, 20_000), {
    L: 2.540,
    W: 1.270,
    corner: 0.1080,
    side: 0.121,
    muSlide: 0.17,
    muRoll: 0.008,
    muSpin: 0.040,
    eCushion: 0.83,
    cloth: [0.10, 0.11, 0.10],
    rail: [0.05, 0.05, 0.05],
    sight: [0.83, 1.00, 0.00],
  }),
];

/** Client-only variants (practice lab physics); never reach the server, which resolves only TABLES. */
const LAB = new Map<string, TableSpec>();
export function registerTable(t: TableSpec): void {
  LAB.set(t.id, t);
}

export const tableById = (id: string): TableSpec | undefined => TABLES.find((t) => t.id === id) ?? LAB.get(id);
export const rulesOf = (table: string): Rules => (tableById(table) ?? TABLES[0]).rules;
