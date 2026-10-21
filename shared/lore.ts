import type { GameState, Report, StrikeCmd } from "./game/types.ts";

/**
 * Table lore: a nickname for every ball and a small physics commentator. Whispers explain the intrinsic mechanics
 * behind what just happened — throw, squirt, stun, massé — so new players learn the cloth while they play.
 * Pure and deterministic given the shot number: every engine whispers the same line.
 */
export const NICKNAMES: Record<number, string> = {
  0: "the ghost",
  1: "sunrise",
  2: "deep water",
  3: "ember",
  4: "nightshade",
  5: "foxfire",
  6: "fern",
  7: "wine",
  8: "the widow",
  9: "the money ball",
  10: "the bandit",
  11: "harlequin",
  12: "flare",
  13: "vine",
  14: "burglar",
  15: "claret",
};

export const nickname = (id: number): string => NICKNAMES[id] ?? `the ${id}`;

/** Rotation of quiet table wisdom for shots with nothing remarkable to explain. */
const TIPS: string[] = [
  "The cloth has a nap: balls roll truer toward the foot of the table.",
  "A frozen pair needs a soft stroke — hard hits push both, soft hits shake one loose.",
  "English throws the object ball against its own friction; cut-induced throw pushes it wider still.",
  "The cue ball rolls where it was struck: low for draw, high for follow, level for stun.",
  "Squirt is the shaft's end mass shoving the cue ball off your aim line — a lighter shaft bends the shot less.",
  "A ball rattling in the jaws has met the drop circle and been refused: it must reach the throat to fall.",
  "Bank shots die on dirty cushions — a warm rail returns more than a cold one.",
  "Chalk the tip before every shot; miscues only ever happen on the stroke you skipped.",
  "Speed is spin's budget: the harder the stroke, the less time english has to work.",
  "The tangent line is a promise — 90° off the contact, unless spin rewrites the contract.",
];

export interface WhisperCtx {
  /** Jaw rattles heard during the shot. */
  jaws?: number;
  /** Cushion contacts during the shot. */
  rails?: number;
}

const el2deg = (el: number) => (2 * Math.atan(el / 1e4) * 180) / Math.PI;

/**
 * One line about the shot that just settled, or null for silence. Notable mechanics always speak; ordinary shots
 * get a rotating tip keyed by the shot number so the same table whispers the same wisdom.
 */
export function whisperOf(cmd: StrikeCmd, rep: Report, st: GameState, ctx: WhisperCtx = {}): string | null {
  const potted = rep.pocketed.filter((id) => id > 0 && !rep.respot.includes(id));
  const pottedName = potted.length ? nickname(potted[0]) : null;
  const elev = el2deg(cmd.el);
  const power = cmd.power / 1000;
  const tx = cmd.tx / 1000, ty = cmd.ty / 1000;

  if (rep.foul === "scratch") return "The ghost took a swim. Scratches are the table's own joke.";
  if (rep.win >= 0) {
    if (rep.end === "eight") return `${nickname(8)} drops and the rack is over — the widow keeps her bargains.`;
    if (rep.end === "nine") return `${nickname(9)} ends it. In nine-ball any legal strike that drops her wins.`;
    if (rep.end === "three-fouls") return "Three fouls: the rules hand the rack away. Patience is a shot too.";
    if (rep.end) return "Game ball, legally delivered. That is the whole contract of the table.";
  }
  if (rep.foul === "no-rail") return "After contact a ball must drop or reach wood — the table demands a consequence.";
  if (rep.foul === "wrong-ball") return `Wrong ball first. The table asked for ${rep.need > 0 ? nickname(rep.need) : "your own colour"} and you answered someone else.`;
  if (rep.foul === "no-contact") return "Air. The cue ball must find a friend — the thinnest miss is still a miss.";
  if (rep.foul === "bad-break") return "A break must scatter: a pot or four balls to cushions, or the rack is re-dealt.";

  if (elev >= 25) return `${Math.round(elev)}° of massé — the cue bit down and the ball curved around, not through.`;
  if (ctx.jaws !== undefined && ctx.jaws >= 2 && pottedName) return `${pottedName} rattled ${ctx.jaws} times and still fell. The jaws chew, but they do not always swallow.`;
  if (ctx.jaws !== undefined && ctx.jaws >= 2) return "That rattled. A ball must pass the jaw line and reach the drop circle to be kept.";
  if (rep.uncalled) return "Sloppy but sweet — an uncalled pot counts for nothing. Call first, celebrate second.";

  if (pottedName && power >= 0.9) return `${pottedName}, hammered. At that speed english has almost no time to speak.`;
  if (pottedName && Math.abs(tx) > 0.35 && potted.length >= 1)
    return `Contact throw: your side spin shoved ${pottedName} a hair off the tangent line — and it still dropped.`;
  if (pottedName && ty < -0.3) return `Draw — struck below centre, ${pottedName} went in and the ghost backed out of its own footprints.`;
  if (pottedName && ty > 0.3) return `Follow — struck above centre, the ghost chased ${pottedName} toward the wood.`;
  if (pottedName && ctx.rails !== undefined && ctx.rails >= 3) return `Three rails and ${pottedName} drops. Geometry is just patience with angles.`;
  if (pottedName) return `${pottedName} stays down. The tangent line kept its promise.`;
  if (Math.abs(ty) < 0.12 && power > 0.35 && power < 0.75) return "Stun — centre-ball, no roll at contact: the ghost slid off along the tangent line.";
  if (power <= 0.12) return "A whisper of a stroke. Soft shots keep the cluster asleep.";
  if (ctx.rails !== undefined && ctx.rails >= 4) return "All that wood and no drop — the cushions had the last word.";

  return TIPS[st.shot % TIPS.length];
}
