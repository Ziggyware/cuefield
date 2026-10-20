/** Every client-side preference with its default. Server-verified play never reads these for physics. */
export const DEFAULTS = {
  botLevel: 0 as 0 | 1 | 2,
  strokeConfirm: false,
  turnAlert: true,
  haptics: true,
  volume: 0.8,
  muteOpponent: false,
  hideOpponentCue: false,
  guideReach: 1,
  guidePrecision: 7,
  practiceGuide: 4 as 1 | 2 | 3 | 4,
  spreadCone: true,
  bankMirror: false,
  ballLabels: false,
  playbackSpeed: 1,
  instantReplay: "button" as "off" | "button" | "auto",
  trails: true,
  ballPalette: "vivid" as "vivid" | "classic" | "neon" | "colorblind",
  clothCustom: false,
  clothHex: "#0b8f5c",
  exposure: 1.3,
  saturation: 1.25,
  accent: "#d4ff00",
  theme: "carbon" as "carbon" | "midnight" | "paper",
  uiScale: 1,
  leftHanded: false,
  aimSensitivity: 1,
  powerCurve: 1.5,
  slideScale: 1,
  rollScale: 1,
  cushionScale: 1,
  pocketScale: 1,
  rewind: true,
  sandbox: false,
  lastMode: 8 as 8 | 9 | 10 | 15,
  lastVenue: "garage",
  ringColor: "white",
};

export type Prefs = { -readonly [K in keyof typeof DEFAULTS]: (typeof DEFAULTS)[K] };
export type PrefKey = keyof Prefs;

const KEY = "cuefield.prefs";

function load(): Prefs {
  const p: Prefs = { ...DEFAULTS };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    for (const k of Object.keys(DEFAULTS) as PrefKey[]) if (typeof raw[k] === typeof DEFAULTS[k]) (p as Record<string, unknown>)[k] = raw[k];
  } catch {
    /* storage unavailable or corrupt: defaults */
  }
  return p;
}

/** What the player chose (persisted). */
const raw: Prefs = load();
/** What the game uses: the choice, or the locked value while its unlock is not owned. */
export const prefs: Prefs = { ...raw };
let owned = new Set<string>();

/** Feature id and the value a key reads while that feature is locked. */
const GATE: Partial<Record<PrefKey, [string, unknown]>> = {
  spreadCone: ["cone", false],
  bankMirror: ["banks", false],
  ballLabels: ["labels", false],
  instantReplay: ["replay", "off"],
  playbackSpeed: ["slowmo", 1],
  trails: ["trails", false],
  strokeConfirm: ["lock", false],
  slideScale: ["lab", 1],
  rollScale: ["lab", 1],
  cushionScale: ["lab", 1],
  pocketScale: ["lab", 1],
  sandbox: ["sandbox", false],
  rewind: ["rewind", false],
  theme: ["themes", "carbon"],
  accent: ["themes", DEFAULTS.accent],
  clothCustom: ["cloth", false],
};

export const gateOf = (k: PrefKey): string | null => GATE[k]?.[0] ?? null;
export const isOwned = (key: string) => owned.has(key);

function effective<K extends PrefKey>(k: K): Prefs[K] {
  const g = GATE[k];
  if (g && !owned.has(`f:${g[0]}`)) return g[1] as Prefs[K];
  if (k === "ballPalette" && !owned.has("f:balls") && !["vivid", "colorblind"].includes(raw.ballPalette)) return "vivid" as Prefs[K];
  if (k === "ringColor" && raw.ringColor !== "white" && !owned.has(`ring:${raw.ringColor}`)) return "white" as Prefs[K];
  return raw[k];
}

const listeners = new Set<(k: PrefKey) => void>();
const keys = Object.keys(DEFAULTS) as PrefKey[];

/** The player's unlock list from the server; re-derives every gated preference. */
export function setOwned(list: string[]): void {
  owned = new Set(list);
  for (const k of keys) (prefs as Record<string, unknown>)[k] = effective(k);
  for (const k of keys) for (const f of listeners) f(k);
}

export function setPref<K extends PrefKey>(k: K, v: Prefs[K]): void {
  raw[k] = v;
  prefs[k] = effective(k);
  try {
    localStorage.setItem(KEY, JSON.stringify(raw));
  } catch {
    /* session-only */
  }
  for (const f of listeners) f(k);
}

export function resetPrefs(): void {
  for (const k of keys) setPref(k, DEFAULTS[k]);
}

export function onPref(f: (k: PrefKey) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

setOwned([]);
