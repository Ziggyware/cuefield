import type { GameState, Report, StrikeCmd } from "../shared/game/types.ts";
import { prefs } from "./prefs/store.ts";
import { toast } from "./dom.ts";

/**
 * Railbird badges: local achievements named for the obscure corners of pool-hall life. They cost nothing, verify
 * nothing on the server and exist purely to give new players small, strange goals at the table.
 */
export interface BadgeDef {
  id: string;
  name: string;
  note: string;
}

export const BADGES: BadgeDef[] = [
  { id: "golden-break", name: "Golden Break", note: "pot a ball on the break without a foul" },
  { id: "widow-maker", name: "Widow Maker", note: "win a rack by legally dropping the 8" },
  { id: "money-ball", name: "Money Ball", note: "win a rack on the 9" },
  { id: "masse-maestro", name: "Massé Maestro", note: "pot a ball struck at 25° of elevation or more" },
  { id: "thunder", name: "Thunder in a Case", note: "pot a ball at 92% power or harder" },
  { id: "feather", name: "Feather Touch", note: "pot a ball at 12% power or softer" },
  { id: "jawbreaker", name: "Jawbreaker", note: "pot a ball in a shot that rattled two jaws or more" },
  { id: "chalked", name: "Chalked & Loaded", note: "pot a ball with a perfect tip and hand coat" },
  { id: "spotless", name: "Spotless", note: "win a rack without a single foul" },
  { id: "run-out", name: "Hot Hand", note: "run five balls in one visit" },
  { id: "centurion", name: "Centurion", note: "pot 100 legal balls across every table on this device" },
  { id: "night-owl", name: "Night Owl", note: "pot a ball between midnight and 5 a.m. local time" },
  { id: "lefty", name: "Lefty Legend", note: "win a rack with the left-handed layout on" },
  { id: "the-wall", name: "The Wall", note: "play three straight clean safeties — no pot, no foul" },
];

export interface BadgeStore {
  won: string[];
  pots: number;
}

const KEY = "cuefield.badges";

function load(): BadgeStore {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<BadgeStore>;
    return { won: Array.isArray(raw.won) ? raw.won.filter((x) => typeof x === "string") : [], pots: Math.max(0, Math.floor(raw.pots ?? 0)) };
  } catch {
    return { won: [], pots: 0 };
  }
}

let store: BadgeStore = load();
/** Consecutive clean no-pot shots by the local player (the safety battle counter). */
let safeties = 0;

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable: badges are session-only */
  }
}

export const badgesWon = (): Set<string> => new Set(store.won);
export const lifetimePots = (): number => store.pots;

function win(id: string): void {
  if (store.won.includes(id)) return;
  store.won.push(id);
  save();
  const b = BADGES.find((x) => x.id === id);
  if (b) toast(`badge earned · ${b.name} — ${b.note}`, 3600);
}

export interface ShotCtx {
  /** State before the stroke and the report it produced. */
  pre: GameState;
  st: GameState;
  rep: Report;
  cmd: StrikeCmd;
  /** The seat the badge belongs to, when that seat is local. */
  seat: 0 | 1 | null;
  /** Jaw rattles and cushion contacts during the shot. */
  jaws: number;
  rails: number;
}

/** Feed every settled shot; badges unlock themselves and toast once. */
export function observe(c: ShotCtx): void {
  const { pre, st, rep, cmd } = c;
  const mine = c.seat !== null && rep.by === c.seat;
  const pots = rep.foul || rep.uncalled ? 0 : rep.pocketed.filter((id) => id > 0 && !rep.respot.includes(id)).length;

  if (mine && pots) {
    store.pots += pots;
    save();
    if (store.pots >= 100) win("centurion");
    const hour = new Date().getHours();
    if (hour < 5) win("night-owl");
    if (2 * Math.atan(cmd.el / 1e4) >= (25 * Math.PI) / 180) win("masse-maestro");
    if (cmd.power >= 920) win("thunder");
    if (cmd.power <= 120) win("feather");
    if (c.jaws >= 2) win("jawbreaker");
    if (cmd.tipChalk !== undefined && cmd.handChalk !== undefined && cmd.tipChalk >= 0.95 && cmd.handChalk >= 0.95) win("chalked");
  }
  if (!pre.broken && st.broken && mine && pots && !rep.foul) win("golden-break");
  if (mine && rep.win === c.seat) {
    if (rep.end === "eight") win("widow-maker");
    if (rep.end === "nine") win("money-ball");
    if (st.fouls[c.seat!] === 0 && st.shot >= 4) win("spotless");
    if (prefs.leftHanded) win("lefty");
  }
  const s = mine ? st.stats?.[rep.by] : null;
  if (s && s.bestRun >= 5) win("run-out");

  if (mine) {
    safeties = pots === 0 && !rep.foul ? safeties + 1 : 0;
    if (safeties >= 3) win("the-wall");
  } else if (c.seat !== null) {
    safeties = 0;
  }
}

/** Reset the safety counter for a new rack. */
export function resetRun(): void {
  safeties = 0;
}
