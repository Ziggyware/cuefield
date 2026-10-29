import { type AssistLevel, cueById, type Mode, MODE_NAME, registerTable, tableById, type TableSpec } from "../../shared/catalog.ts";
import { CHALLENGES, challengeState, clearsStation, type ChallengeId } from "../../shared/game/challenges.ts";
import { newGame } from "../../shared/game/engine.ts";
import { ball, RACK_SHAPES, type RackShape, shapeRack } from "../../shared/game/rack.ts";
import type { GameState } from "../../shared/game/types.ts";
import { effectiveCue } from "../../shared/upgrades.ts";
import type { Profile } from "../api.ts";
import { toast } from "../dom.ts";
import { emoteText } from "../../shared/social.ts";
import { prefs } from "../prefs/store.ts";
import { mountTable } from "./table-screen.ts";

/** Practice setups: a plain rack, the Around-the-World drill, or one of the trick racks. */
export type PracticeSetup = "free" | "drill" | RackShape | ChallengeId;

export const SETUP_CHOICES: [PracticeSetup, string][] = [
  ["free", "free rack"],
  ["drill", "around the world"],
  ...CHALLENGES.map((c) => [c.id, c.name] as [PracticeSetup, string]),
  ...RACK_SHAPES.map((s) => [s.id, s.name] as [PracticeSetup, string]),
];

/** Around-the-World: twelve stations ringing the table, one ball to drop from each. */
const STATIONS = 12;
/** Trick racks use a fixed seed, so a failed trick can be retried on the exact same layout. */
const TRICK_SEED = 0x721c;

/** The venue with the practice-lab multipliers applied, registered under an id that keys its geometry cache. */
function labTable(id: string): string {
  const b = tableById(id)!;
  const k = [prefs.slideScale, prefs.rollScale, prefs.cushionScale, prefs.pocketScale];
  if (k.every((v) => v === 1)) return id;
  const t: TableSpec = {
    ...b,
    id: `lab:${id}:${k.join(":")}`,
    muSlide: b.muSlide * k[0],
    muRoll: b.muRoll * k[1],
    eCushion: Math.min(0.98, b.eCushion * k[2]),
    corner: b.corner * k[3],
    side: b.side * k[3],
  };
  registerTable(t);
  return t.id;
}

const clone = (st: GameState): GameState => structuredClone(st);

/** One drill station: the cue ball on the ring at `step`, the object ball alone at the table's heart. */
function drillState(mode: Mode, spec: TableSpec, step: number): GameState {
  const st = newGame(mode, spec.id, ((step + 1) * 7919) >>> 0, 0);
  const a = (step * 2 * Math.PI) / STATIONS;
  const rx = spec.L * 0.3, ry = Math.min(spec.W * 0.28, spec.L * 0.12);
  st.balls = [ball(0, Math.cos(a) * rx, Math.sin(a) * ry), ball(1, 0, 0)].sort((x, y) => x.id - y.id);
  // Stations start settled: no kitchen placement, no break rule — just the shot.
  st.bih = 0;
  st.broken = true;
  return st;
}

/**
 * Single-player table: free, every stroke is yours, fouls still give ball in hand. Guide level, physics, rewind
 * and the sandbox come from the practice settings; the setup picks a plain rack, the Around-the-World drill (with a
 * local personal best) or a deterministic trick rack. The rack resets when the game would end or the table clears.
 */
export function playFree(
  ui: HTMLElement,
  me: Profile,
  mode: Mode,
  table: string,
  assist: AssistLevel,
  exit: () => void,
  setup: PracticeSetup = "free",
): void {
  const cue = effectiveCue(cueById(me.cue), me.upgrades);
  const id = labTable(table);
  const spec = tableById(id)!;
  const challenge = CHALLENGES.find((c) => c.id === setup) ?? null;
  const shape = RACK_SHAPES.find((s) => s.id === setup)?.id ?? null;
  const shapeName = shape ? RACK_SHAPES.find((s) => s.id === shape)?.name ?? shape : "";

  let station = 0, total = 0;
  const bestKey = challenge ? `cuefield.challenge.${challenge.id}.${table}` : `cuefield.drill.${table}`;
  const best = (): number => {
    try {
      return Number(localStorage.getItem(bestKey)) || 0;
    } catch {
      return 0;
    }
  };

  const rack = (): GameState => {
    const st = newGame(mode, id, (Math.random() * 2 ** 31) >>> 0, 0);
    if (setup === "drill") return drillState(mode, spec, station);
    if (challenge) return challengeState(challenge.id, mode, id, station);
    if (shape) {
      st.balls = shapeRack(mode, spec.L, spec.W, shape, TRICK_SEED);
      // The trick is the layout: no kitchen placement, no break rule, just the shot as arranged.
      st.bih = 0;
      st.broken = true;
    }
    return st;
  };

  const history: GameState[] = [];
  const extra = prefs.rewind && !challenge
    ? [{
      text: "undo",
      fn: () => {
        const prev = history.pop();
        if (!prev || screen.session.sim) return toast("nothing to undo");
        screen.session.setState(prev);
        label();
      },
    }]
    : [];

  const label = () => {
    if (setup === "drill") {
      const b = best();
      screen.hud.stake.textContent =
        `around the world · station ${Math.min(station + 1, STATIONS)}/${STATIONS} · ${total + screen.session.state.shot} strokes` +
        (b ? ` · best ${b}` : "");
    } else if (challenge) {
      const b = best();
      screen.session.challengePocket = challenge.id === "pocket-tour" ? station : null;
      screen.session.dirty = true;
      const progress = challenge.id === "three-ball" ? `${total}/5 shots` : `station ${station + 1}/${challenge.stations} · ${total} shots`;
      screen.hud.stake.textContent = `${challenge.name} · ${progress}${b ? ` · best ${b}` : ""}`;
    }
  };

  const screen = mountTable(
    ui,
    rack(),
    [cue, cue],
    [{ name: me.name }, { name: "" }],
    setup === "drill" || challenge ? "" : `${MODE_NAME[mode].toLowerCase()} · practice${shapeName ? ` · ${shapeName}` : ""}${id !== table ? " · lab physics" : ""}`,
    {
      isLocal: () => true,
      shoot: () => {
        history.push(clone(screen.session.state));
        if (history.length > 50) history.shift();
        if (setup === "drill") label();
      },
      settled: (st) => {
        if (challenge) {
          total++;
          const rep = st.last;
          const finish = (success: boolean) => {
            if (success) {
              const b = best();
              if (!b || total < b) {
                try { localStorage.setItem(bestKey, String(total)); } catch { /* storage unavailable */ }
                toast(`${challenge.name}: ${total} shots · new personal best`, 3200);
              } else toast(`${challenge.name}: ${total} shots · best ${b}`, 3200);
            } else toast(`${challenge.name}: run over · try again`, 2500);
            station = 0; total = 0;
          };
          if (challenge.id === "three-ball") {
            const left = st.balls.some((b) => b.on && b.id > 0);
            if (rep?.foul || rep?.uncalled) finish(false);
            else if (!left) finish(true);
            else if (total >= 5 || st.winner >= 0) finish(false);
            else { st.turn = 0; st.fouls = [0, 0]; label(); return; }
          } else {
            const cleared = clearsStation(challenge.id, station, rep, screen.session.lastShot?.events ?? []);
            if (cleared) {
              station++;
              if (station >= challenge.stations) finish(true);
              else toast(`${challenge.name} · station ${station}/${challenge.stations} cleared`, 1600);
            } else if (!st.balls.some((b) => b.on && b.id === 1) || st.winner >= 0 || rep?.offTable?.includes(1)) {
              toast(challenge.id === "pocket-tour" ? "Wrong pocket or foul · retry this station" : "Bank the object ball off a cushion first · retry", 2000);
            } else { st.turn = 0; st.fouls = [0, 0]; label(); return; }
          }
          screen.session.setState(challengeState(challenge.id, mode, id, station));
          label();
          return;
        }
        if (setup === "drill") {
          const rep = st.last;
          if (rep && !rep.foul && rep.pocketed.includes(1)) {
            total += st.shot;
            station++;
            if (station >= STATIONS) {
              const b = best();
              if (!b || total < b) {
                try {
                  localStorage.setItem(bestKey, String(total));
                } catch {
                  /* storage unavailable: best is session-only */
                }
                toast(`around the world in ${total} strokes — new personal best`, 3200);
              } else toast(`around the world in ${total} strokes · best ${b}`, 3200);
              station = 0;
              total = 0;
            } else toast(`station ${station}/${STATIONS} cleared`, 1400);
            screen.session.setState(drillState(mode, spec, station));
            label();
            return;
          }
          // A scratch that sank the only ball, or any odd ending: rebuild the same station.
          if (st.winner >= 0 || !st.balls.some((b) => b.on && b.id > 0)) {
            screen.session.setState(drillState(mode, spec, station));
            label();
            return;
          }
          st.turn = 0;
          st.fouls = [0, 0];
          label();
          return;
        }
        const left = st.balls.some((b) => b.on && b.id > 0);
        if (st.winner >= 0 || !left) return screen.session.setState(rack());
        st.turn = 0;
        st.fouls = [0, 0];
      },
    },
    {
      emote: (k) => screen.hud.bubble(0, emoteText(k) ?? ""),
      chat: (t) => screen.hud.bubble(0, t),
      concede: () => (screen.destroy(), exit()),
      extra,
    },
    { assist, unlocks: me.unlocks },
  );
  screen.session.sandbox = prefs.sandbox && !challenge;
  if (setup === "drill" || challenge) label();
  if (challenge) toast(challenge.note, 4200);
  if (shape) {
    const note = RACK_SHAPES.find((s) => s.id === shape)?.note;
    if (note) toast(`${shapeName}: ${note}`, 3600);
  }
}
