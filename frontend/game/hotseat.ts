import { cueById, type Mode, MODE_NAME, tableById } from "../../shared/catalog.ts";
import { newGame } from "../../shared/game/engine.ts";
import type { GameState } from "../../shared/game/types.ts";
import { effectiveCue } from "../../shared/upgrades.ts";
import { emoteText } from "../../shared/social.ts";
import type { Profile } from "../api.ts";
import { h, modal } from "../dom.ts";
import { mountTable, type TableScreen } from "./table-screen.ts";

/**
 * Hot-seat duel: pass-&-play for two people on one device. No coins, no server, no network — the engine simply
 * alternates turns and an opaque curtain hides the table at every hand-over, so nobody aims on the other's plan.
 */
export function playHotSeat(ui: HTMLElement, me: Profile, mode: Mode, table: string, names: [string, string], exit: () => void): void {
  const spec = tableById(table)!;
  // Both seats play the account's own cue: same device, same slate, same chances.
  const cue = effectiveCue(cueById(me.cue), me.upgrades);
  const seed = () => (Math.random() * 2 ** 31) >>> 0;
  const rack = (breaker: 0 | 1) => newGame(mode, table, seed(), breaker);
  let breaker: 0 | 1 = Math.random() < 0.5 ? 0 : 1;
  let screen: TableScreen;
  let shownTurn: 0 | 1 = breaker;

  /** Opaque pass curtain: the table stays hidden until the next player says they are ready. */
  const gate = (seat: 0 | 1) => {
    shownTurn = seat;
    const m = modal(
      h("div", { class: "big", text: `pass to ${names[seat]}` }),
      h("span", { class: "k", text: `${MODE_NAME[mode]} · ${spec.name} · hot seat` }),
      h("button", { class: "primary", "data-esc": true, text: `i'm ${names[seat]} · ready`, onclick: () => m.close() }),
    );
    m.el.style.background = "#08090a";
  };

  const end = (st: GameState) => {
    const w = st.winner as 0 | 1;
    const m = modal(
      h("div", { class: "big v", text: `${names[w]} takes the rack` }),
      h("span", { class: "k", text: `${MODE_NAME[mode]} at ${spec.name} · ${st.shot} shots` }),
      h(
        "div",
        { class: "row" },
        h("button", {
          class: "primary",
          text: "next rack",
          onclick: () => {
            m.close();
            breaker = (1 - breaker) as 0 | 1;
            screen.session.setState(rack(breaker));
            gate(breaker);
          },
        }),
        h("button", { text: "lobby", "data-esc": true, onclick: () => (m.close(), screen.destroy(), exit()) }),
      ),
    );
  };

  screen = mountTable(
    ui,
    rack(breaker),
    [cue, cue],
    [{ name: names[0] }, { name: names[1] }],
    `hot seat · ${spec.name}`,
    {
      isLocal: () => true,
      shoot: () => {},
      settled: (st) => {
        if (st.winner >= 0) return end(st);
        if (st.turn !== shownTurn) gate(st.turn);
      },
    },
    {
      emote: (k) => screen.hud.bubble(screen.session.state.turn, emoteText(k) ?? ""),
      chat: (t) => screen.hud.bubble(screen.session.state.turn, t),
      concede: () => (screen.destroy(), exit()),
    },
    { assist: spec.assist, unlocks: me.unlocks },
  );
  gate(breaker);
}
