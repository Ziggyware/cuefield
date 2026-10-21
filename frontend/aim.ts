import type { CueSpec } from "../shared/catalog.ts";
import type { StrikeCmd } from "../shared/game/types.ts";
import { prefs } from "./prefs/store.ts";

/** angle rad (world), power 0..1, tip −1..1 (y up), elev rad. */
export interface Aim {
  angle: number;
  power: number;
  tx: number;
  ty: number;
  elev: number;
  tipChalk: number;
  handChalk: number;
}

export function toCmd(a: Aim, cue: CueSpec, power: number, place?: [number, number], call?: number, finesse?: number): StrikeCmd {
  const r = Math.hypot(a.tx, a.ty), k = r > 1 ? 1 / r : 1;
  const cmd: StrikeCmd = {
    k: "strike",
    dx: Math.round(Math.cos(a.angle) * 1e6),
    dy: Math.round(Math.sin(a.angle) * 1e6),
    power: Math.max(1, Math.min(1000, Math.round(Math.pow(power, prefs.powerCurve) * 1000))),
    tx: Math.round(a.tx * k * 1000),
    ty: Math.round(a.ty * k * 1000),
    el: Math.min(cue.elev, Math.round(Math.tan(a.elev / 2) * 1e4)),
    tipChalk: Math.round(a.tipChalk * 1000) / 1000,
    handChalk: Math.round(a.handChalk * 1000) / 1000,
  };
  if (place) cmd.place = [Math.round(place[0] * 1e5) / 1e5, Math.round(place[1] * 1e5) / 1e5];
  if (call !== undefined) cmd.call = call;
  if (finesse !== undefined) cmd.finesse = Math.max(0, Math.min(1000, Math.round(finesse)));
  return cmd;
}

export const maxElev = (cue: CueSpec) => 2 * Math.atan(cue.elev / 1e4);

export { type Preview, preview } from "./preview.ts";
