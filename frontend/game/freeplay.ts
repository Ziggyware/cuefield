import { type AssistLevel, cueById, type Mode, MODE_NAME, registerTable, tableById, type TableSpec } from "../../shared/catalog.ts";
import { newGame } from "../../shared/game/engine.ts";
import type { GameState } from "../../shared/game/types.ts";
import { effectiveCue } from "../../shared/upgrades.ts";
import type { Profile } from "../api.ts";
import { toast } from "../dom.ts";
import { emoteText } from "../../shared/social.ts";
import { prefs } from "../prefs/store.ts";
import { mountTable } from "./table-screen.ts";

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

/**
 * Single-player table: free, every stroke is yours, fouls still give ball in hand. Guide level, physics, rewind
 * and the sandbox come from the practice settings. The rack resets when the game would end or the table clears.
 */
export function playFree(ui: HTMLElement, me: Profile, mode: Mode, table: string, assist: AssistLevel, exit: () => void): void {
  const cue = effectiveCue(cueById(me.cue), me.upgrades);
  const id = labTable(table);
  const rack = () => newGame(mode, id, (Math.random() * 2 ** 31) >>> 0, 0);
  const history: GameState[] = [];
  const extra = prefs.rewind
    ? [{
      text: "undo",
      fn: () => {
        const prev = history.pop();
        if (!prev || screen.session.sim) return toast("nothing to undo");
        screen.session.setState(prev);
      },
    }]
    : [];
  const screen = mountTable(
    ui,
    rack(),
    [cue, cue],
    [{ name: me.name }, { name: "" }],
    `${MODE_NAME[mode].toLowerCase()} · practice${id !== table ? " · lab physics" : ""}`,
    {
      isLocal: () => true,
      shoot: () => {
        history.push(clone(screen.session.state));
        if (history.length > 50) history.shift();
      },
      settled: (st) => {
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
  screen.session.sandbox = prefs.sandbox;
}
