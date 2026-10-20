import { CHEERS, cleanChat, emoteText } from "../../shared/social.ts";
import type { StrikeCmd } from "../../shared/game/types.ts";
import { validate } from "../../shared/game/validate.ts";
import { h, modal } from "../dom.ts";
import type { AppMsg, Head } from "../net/peer.ts";
import { prefs } from "../prefs/store.ts";
import { cheerFlash } from "../ui/hud.ts";
import type { TableScreen } from "./table-screen.ts";

const placeOf = (p: unknown): [number, number] | null =>
  Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v)) ? [p[0], p[1]] : null;

/** A peer stroke is played locally only if it is a legal command for the opponent's cue; anything else waits for the server. */
function legalStroke(screen: TableScreen, other: 0 | 1, raw: unknown): StrikeCmd | null {
  const cmd = raw as StrikeCmd;
  if (!cmd || typeof cmd !== "object" || cmd.k !== "strike") return null;
  try {
    return validate(screen.session.state, cmd, screen.session.cues[other]) ? null : cmd;
  } catch {
    return null;
  }
}

/** Data-channel / relay traffic from the opponent: strokes, live aim, emotes and chat. */
export function appHandler(screen: TableScreen, other: 0 | 1): (m: AppMsg) => void {
  const S = screen.session;
  return (m) => {
    if (m.t === "shot") {
      const cmd = !S.sim && S.state.turn === other && m.shot === S.state.shot ? legalStroke(screen, other, m.cmd) : null;
      if (cmd) S.play(cmd);
    } else if (m.t === "aim" && !S.sim && S.state.turn === other) {
      const a = m.a as typeof S.aim;
      if (a && Number.isFinite(a.angle)) S.remoteAim = { a, pull: Number(m.pull) || 0, place: placeOf(m.place) };
    } else if (prefs.muteOpponent) return;
    else if (m.t === "emo") {
      const t = emoteText(m.e ?? `basic:${m.i}`);
      if (t) screen.hud.bubble(other, t);
    } else if (m.t === "chat") {
      const t = cleanChat(m.text);
      if (t) screen.hud.bubble(other, t);
    }
  };
}

/** Link state, spectator count and fresh cheers into the HUD. */
export function showHead(screen: TableScreen, hd: Head, direct: boolean): void {
  const w = hd.watching ? ` · ${hd.watching} watching` : "";
  screen.hud.net.textContent = `${direct ? "· direct" : "· relay"}${w}`;
  for (const c of hd.cheers) if (CHEERS[c.kind]) cheerFlash(screen.hud, CHEERS[c.kind]);
}

/** Quit menu: correspondence tables can be left open; real-time ones can only be conceded. */
export function leaveMenu(corr: boolean, leave: () => void, concede: () => void): void {
  const m = modal(
    h("div", { class: "big", text: corr ? "leave table" : "concede?" }),
    h("span", { class: "k", text: corr ? "The match stays open: you have a day for each shot." : "Your opponent wins and takes the pot." }),
    h(
      "div",
      { class: "row" },
      corr ? h("button", { class: "primary", text: "leave", onclick: () => (m.close(), leave()) }) : null,
      h("button", { class: corr ? "" : "primary", text: "concede", onclick: () => (m.close(), concede()) }),
      h("button", { text: "cancel", "data-esc": true, onclick: () => m.close() }),
    ),
  );
}
