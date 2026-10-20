import { type Mode, ROTATION_TARGET, type Rules, rulesOf, type TableSpec } from "../../shared/catalog.ts";
import { needsCall, target } from "../../shared/game/rules.ts";
import type { GameState, Report } from "../../shared/game/types.ts";

/** Prediction names by level 1–4 (index 0 unused). */
export const ASSIST_NAME = ["", "no prediction", "cue ball only", "cue + first ball", "full prediction"];
export const ASSIST_SHORT = ["", "none", "cue ball", "cue + 1st ball", "full"];

const needText = (need: number): string =>
  need > 0 ? `the ${need}` : need === -1 ? "a solid" : need === -2 ? "a stripe" : need === -3 ? "any ball but the 8" : "";

/** Rule lines a venue enforces, strictest last. */
export function rulesList(r: Rules, mode: Mode): string[] {
  const out = ["legal ball first · foul gives ball in hand"];
  if (mode === 15) out.push(`balls score their number · first to ${ROTATION_TARGET}`);
  if (mode === 10) out.push("every shot called · the 10 wins");
  else if (r.callEight && mode !== 15) out.push(`call the pocket for the ${mode}`);
  if (r.breakRule) out.push("break: pot a ball or drive four to cushions");
  if (r.railRule) out.push("after contact a ball must pot or reach a cushion");
  if (r.callShot) out.push("call every shot");
  if (r.threeFoul) out.push("three fouls in a row lose");
  out.push(`${r.clock / 1000}s shot clock`);
  return out;
}

export const venueLine = (t: TableSpec, mode: Mode) => rulesList(t.rules, mode).join(" · ");

function foulText(rep: Report): string {
  switch (rep.foul) {
    case "scratch":
      return "foul: cue ball pocketed";
    case "no-contact":
      return "foul: cue ball touched nothing";
    case "wrong-ball":
      return `foul: hit the ${rep.hit} first, needed ${needText(rep.need)}`;
    case "no-rail":
      return "foul: nothing reached a cushion after contact";
    case "bad-break":
      return "foul: break pocketed nothing and drove fewer than four to cushions";
    case "timeout":
      return "foul: shot clock ran out";
    default:
      return "";
  }
}

export const END_TEXT: Record<string, string> = {
  eight: "8 pocketed",
  nine: "9 pocketed",
  ten: "10 pocketed",
  points: `${ROTATION_TARGET} points reached`,
  "eight-early": "8 pocketed before the group was cleared",
  "eight-foul": "8 pocketed on a foul",
  "eight-pocket": "8 went in an uncalled pocket",
  "three-fouls": "three fouls in a row",
};

/** HUD status: what the last stroke did, then what the shooter now owes the rules. */
export function statusText(st: GameState): string {
  const parts: string[] = [];
  const last = st.last;
  if (last?.foul) parts.push(foulText(last));
  else if (last?.uncalled) parts.push("nothing in the called pocket · turn passes");
  if (st.winner >= 0) return last?.end ? END_TEXT[last.end] : parts.join(" · ");
  if (st.bih === 1) parts.push(st.shot === 0 ? "break · place the cue ball behind the line" : "ball in hand behind the line");
  else if (st.bih === 2) parts.push("ball in hand · drag the cue ball");
  if (st.broken) parts.push(`on ${needText(target(st))}`);
  if (needsCall(st, rulesOf(st.table))) parts.push("tap a pocket to call it");
  if (st.mode === 15) parts.push(`${st.score?.[0] ?? 0} : ${st.score?.[1] ?? 0} of ${ROTATION_TARGET}`);
  return parts.join(" · ");
}
