import type { TableSpec } from "./venues.ts";

export * from "./venues.ts";

/** 8-ball, 9-ball, 10-ball (every shot called), rotation (15 balls, ball value = number, first to 61). */
export type Mode = 8 | 9 | 10 | 15;
export const MODES: Mode[] = [8, 9, 10, 15];
export const MODE_NAME: Record<Mode, string> = { 8: "8-BALL", 9: "9-BALL", 10: "10-BALL", 15: "ROTATION" };
export const isMode = (m: unknown): m is Mode => MODES.includes(m as Mode);
export const ROTATION_TARGET = 61;

/**
 * speed: max cue speed m/s. spin: max tip offset / R. elev: max tan(θ/2)·1e4. endMass: shaft end mass kg (squirt).
 * guide: aim-line length m. mass: cue mass kg. tipE: tip restitution. wobble: 1σ stroke aim error rad.
 * luck: drop allowance at the pocket lip, m. finish: cosmetic finish index.
 */
export interface CueSpec {
  id: string;
  price: number;
  speed: number;
  spin: number;
  elev: number;
  endMass: number;
  guide: number;
  mass: number;
  tipE: number;
  wobble: number;
  luck: number;
  finish: number;
  shaft: string;
  butt: string;
  ring: string;
}

const C = (
  id: string,
  price: number,
  speed: number,
  spin: number,
  elev: number,
  endMass: number,
  guide: number,
  wobble: number,
  shaft: string,
  butt: string,
  ring: string,
): CueSpec => ({
  id,
  price,
  speed,
  spin,
  elev,
  endMass,
  guide,
  mass: 0.54,
  tipE: 0.75,
  wobble,
  luck: 0,
  finish: 0,
  shaft,
  butt,
  ring,
});

export const CUES: CueSpec[] = [
  C("ash", 0, 5.2, 0.30, 4142, 0.0110, 0.35, 0.0030, "#d9c7a0", "#5a3b22", "#e8e2d0"),
  C("maple", 400, 5.7, 0.36, 5206, 0.0095, 0.55, 0.0025, "#e6d6b0", "#7a2f1d", "#c9b27a"),
  C("carbon", 1500, 6.2, 0.42, 6371, 0.0060, 0.8, 0.0020, "#1b1d20", "#2b2f35", "#8a9099"),
  C("ebony", 4000, 6.7, 0.46, 7673, 0.0055, 1.0, 0.0015, "#e9dcc0", "#0f0c0a", "#b8ffe0"),
  C("titan", 10000, 7.4, 0.50, 9163, 0.0045, 1.3, 0.0011, "#141512", "#08090a", "#d4ff00"),
];

export const cueById = (id: string): CueSpec => CUES.find((c) => c.id === id) ?? CUES[0];

export const START_COINS = 0;
export const DAILY_BASE = 100;
export const DAILY_STEP = 25;
export const DAILY_CAP = 6;
export const SHOT_CLOCK_MS = 30_000;
export const ELO_K = 32;
export const START_RATING = 1200;

/** Bot levels: cue and how much the house stakes against your entry fee. */
export const BOT_CUES = ["maple", "carbon", "titan"];
export const BOT_MATCH = [0.5, 1, 1.5];
/** Ceiling on net coins won from bot matches per day (bot strokes are client-chosen). */
export const BOT_DAILY_NET = 2000;

/** Online pot: both entry fees. Bot pot: your fee plus the house's matched stake. */
export const onlinePot = (t: TableSpec) => 2 * t.fee;
/** House prize for beating the bot at a free venue (no fees to build a pot from); counts toward BOT_DAILY_NET. */
export const FREE_BOT_PRIZE = [10, 20, 30];
export const botPot = (t: TableSpec, level: number) => (t.fee ? t.fee + Math.round(t.fee * BOT_MATCH[level]) : FREE_BOT_PRIZE[level]);
