import type { CueSpec } from "./catalog.ts";

export type Track = "power" | "spin" | "masse" | "control" | "guide" | "weight" | "handle" | "luck" | "color";
export type Upgrades = Partial<Record<Track, number>>;

export interface UpgradeDef {
  id: Track;
  name: string;
  costs: number[];
  /** Per-level effect as shown in the store. */
  step: string;
}

/** Every track except colour changes the strike; higher ranks also tighten the stroke so the guide is truer. */
/** Logarithmic price curve: level l costs base · (1 + 1.6 ln(1 + l)), rounded to 10. */
const LOG = (base: number) => Array.from({ length: 5 }, (_, l) => Math.round((base * (1 + 1.6 * Math.log(1 + l))) / 10) * 10);

export const UPGRADES: UpgradeDef[] = [
  { id: "power", name: "max power", costs: LOG(100), step: "+0.16 m/s ball speed" },
  { id: "spin", name: "tip", costs: LOG(120), step: "+2% R tip offset, +0.01 tip restitution" },
  { id: "masse", name: "max massé", costs: LOG(150), step: "+4° cue elevation" },
  { id: "control", name: "ball end", costs: LOG(120), step: "−8% shaft end mass: less squirt" },
  { id: "guide", name: "prediction length", costs: LOG(900), step: "+20% aim guide reach" },
  { id: "weight", name: "weight", costs: LOG(100), step: "+20 g cue mass: more energy into the ball" },
  { id: "handle", name: "handle", costs: LOG(150), step: "−15% stroke wobble" },
  { id: "luck", name: "luck", costs: LOG(200), step: "+1.5 mm pocket-lip drop, −5% wobble" },
  { id: "color", name: "colour", costs: LOG(50), step: "new cue finish (cosmetic)" },
];

export const MAX_LEVEL = 5;
export const MAX_ELEV = 9163;

export const levelOf = (u: Upgrades, t: Track): number => Math.max(0, Math.min(MAX_LEVEL, Math.floor(u[t] ?? 0)));

/** Base cue with upgrade levels applied. Elevation stays an integer tan(θ/2)·1e4 so every engine agrees on it. */
export function effectiveCue(base: CueSpec, u: Upgrades): CueSpec {
  const L = (t: Track) => levelOf(u, t);
  const theta = 2 * Math.atan(base.elev / 1e4) + (L("masse") * 4 * Math.PI) / 180;
  const fin = FINISHES[L("color")];
  return {
    ...base,
    ...(L("color") ? { shaft: fin[0], butt: fin[1], ring: fin[2] } : {}),
    speed: base.speed + 0.12 * L("power"),
    spin: Math.min(0.5, base.spin + 0.02 * L("spin")),
    tipE: base.tipE + 0.01 * L("spin"),
    elev: Math.min(MAX_ELEV, Math.round(Math.tan(theta / 2) * 1e4)),
    endMass: base.endMass * (1 - 0.08 * L("control")),
    guide: base.guide * (1 + 0.2 * L("guide")),
    mass: base.mass + 0.02 * L("weight"),
    wobble: base.wobble * (1 - 0.15 * L("handle")) * (1 - 0.05 * L("luck")),
    luck: 0.0015 * L("luck"),
    finish: L("color"),
  };
}

/** Cue finishes by colour level: shaft, butt, ring. Level 0 keeps the cue's own. */
export const FINISHES: [string, string, string][] = [
  ["", "", ""],
  ["#e9e4d6", "#24324a", "#c9d4e8"],
  ["#efe2c4", "#4a1420", "#e0b25a"],
  ["#d8dcd2", "#0d2a1c", "#7affc4"],
  ["#1a1a1a", "#3b0a4a", "#ff4dd2"],
  ["#0b0c0a", "#0b0c0a", "#d4ff00"],
];
