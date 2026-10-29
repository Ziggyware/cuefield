import { MODE_NAME } from "../../shared/catalog.ts";
import type { StrikeCmd } from "../../shared/game/types.ts";
import { hash } from "../../shared/game/validate.ts";
import { CHEERS } from "../../shared/social.ts";
import { api } from "../api.ts";
import { h, modal, toast } from "../dom.ts";
import { linkTo, share, viewerId } from "../links.ts";
import { cheerFlash } from "../ui/hud.ts";
import type { WatchView } from "./match-view.ts";
import { mountTable } from "./table-screen.ts";

const POLL_MS = 1000;

/**
 * Read-only seat at someone else's table. Strokes arrive from the server log and are re-simulated locally, so the
 * spectator sees the same deterministic motion the players saw. Reactions go to both players.
 */
export async function watchMatch(ui: HTMLElement, id: string, exit: () => void, replay: (id: string) => void): Promise<void> {
  const v = viewerId();
  const get = (after: number) => api<WatchView>(`/watch/${id}?v=${v}&after=${after}`);
  const first = await get(-1);
  let cursor = Math.max(0, ...first.cheers.map((c) => c.id)), shown = false, timer = 0, alive = true;
  const names = `${first.players[0].name} vs ${first.players[1].name}`;

  const cheer = () => {
    const m = modal(
      h("div", { class: "big", text: "cheer" }),
      h("div", { class: "seg col4" }, ...CHEERS.map((t, kind) => h("button", { text: t, onclick: () => (m.close(), send(kind)) }))),
      h("button", { text: "close", "data-esc": true, onclick: () => m.close() }),
    );
  };
  const send = (kind: number) =>
    api(`/watch/${id}/cheer`, { v, kind }).then(() => cheerFlash(screen.hud, CHEERS[kind])).catch(() => toast("one cheer every few seconds"));

  const screen = mountTable(
    ui,
    first.state,
    [first.players[0].cue, first.players[1].cue],
    [first.players[0], first.players[1]],
    `watching · ${MODE_NAME[first.mode].toLowerCase()}${first.corr ? " · correspondence" : ""}`,
    { isLocal: () => false, shoot: () => {}, settled: () => tick() },
    {
      emote: () => {},
      chat: () => {},
      noSay: true,
      concede: () => finish(),
      extra: [{ text: "cheer", fn: cheer }, { text: "⇪", fn: () => share(linkTo("watch", id), names) }],
    },
    { assist: first.assist },
  );
  const S = screen.session;

  const apply = (w: WatchView) => {
    S.clockSpan = w.clock;
    S.deadline = w.status === "live" ? w.deadline - (w.now - Date.now()) : 0;
    screen.hud.net.textContent = `· ${w.watching} watching`;
    for (const c of w.cheers) {
      cursor = Math.max(cursor, c.id);
      if (CHEERS[c.kind]) cheerFlash(screen.hud, CHEERS[c.kind]);
    }
    const lc = w.last?.cmd;
    if (w.state.shot === S.state.shot + 1 && lc?.k === "strike" && S.state.winner < 0) return S.play(lc as StrikeCmd);
    if (hash(S.state) !== w.hash) S.setState(w.state);
    if (w.status === "done" && !shown) {
      shown = true;
      const who = w.winner < 0 ? "no result" : `${w.players[w.winner].name} wins`;
      const m = modal(
        h("div", { class: "big", text: who }),
        h("span", { class: "k", text: names }),
        h(
          "div",
          { class: "row" },
          h("button", { class: "primary", text: "replay", onclick: () => (m.close(), finish(() => replay(id))) }),
          h("button", { text: "leave", "data-esc": true, onclick: () => (m.close(), finish()) }),
        ),
      );
    }
  };

  async function tick(): Promise<void> {
    clearTimeout(timer);
    if (!alive) return;
    if (!S.sim && !S.replay) {
      try {
        const view = await get(cursor);
        if (!S.sim && !S.replay) apply(view);
      } catch {
        /* transient: retry on the next tick */
      }
    }
    if (alive) timer = setTimeout(tick, POLL_MS);
  }

  function finish(then: () => void = exit) {
    if (!alive) return;
    alive = false;
    clearTimeout(timer);
    screen.destroy();
    then();
  }
  apply({ ...first, cheers: [] });
  timer = setTimeout(tick, POLL_MS);
}
