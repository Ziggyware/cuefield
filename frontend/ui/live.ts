import { MODE_NAME, tableById } from "../../shared/catalog.ts";
import { api, type Profile } from "../api.ts";
import { countdown, h } from "../dom.ts";
import type { DailyInfo, Hub } from "../net/hub.ts";
import { challengeModal } from "./challenge.ts";
import type { LobbyActions } from "./play.ts";

const venue = (id: string) => tableById(id)?.name ?? id;
const empty = (text: string) => h("span", { class: "k", text });

function dailyCard(d: DailyInfo, act: LobbyActions): HTMLElement {
  return h(
    "div",
    { class: "card" },
    h(
      "div",
      { class: "row" },
      h("b", { text: "DAILY RACK" }),
      h("span", { class: "grow" }),
      h("span", { class: "k", text: `new rack in ${countdown(d.ends)}` }),
    ),
    h("span", { class: "k", text: `Same ${MODE_NAME[d.mode]} rack for everyone at ${venue(d.table)}. Score = strokes + fouls; lowest wins the day.` }),
    h("span", { text: d.best === null ? `first clear pays ${d.reward}c` : `your best today: ${d.best}` }),
    d.board.length
      ? h("table", { class: "list" }, ...d.board.slice(0, 5).map((r, i) => h("tr", {}, h("td", { text: `${i + 1}. ${r.name}` }), h("td", { text: r.score }))))
      : empty("nobody has cleared it yet"),
    h("button", { class: "primary", text: "play today's rack", onclick: () => act.daily() }),
  );
}

/** Multiplayer hub tab: daily rack, who is online, live tables to watch and replays of your recent matches. */
export function live(p: Profile, act: LobbyActions): HTMLElement[] {
  const daily = h("div", {}, empty("loading daily rack"));
  const people = h("div", {}, empty("loading"));
  const tables = h("div", {}, empty("loading"));
  const mine = h("div", {});
  api<DailyInfo>("/daily").then((d) => daily.replaceChildren(dailyCard(d, act))).catch(() => daily.replaceChildren(empty("daily rack unavailable")));
  api<Hub>("/hub").then((hb) => {
    people.replaceChildren(
      ...(hb.online.length
        ? hb.online.map((o) =>
          h(
            "div",
            { class: "who" },
            h("span", { text: o.name }),
            h("span", { class: "k", text: o.busy ? "playing" : String(o.rating) }),
            h("button", { class: o.busy ? "" : "primary", text: "challenge", disabled: o.busy || p.id === o.id, onclick: () => challengeModal(o, act) }),
          )
        )
        : [empty("nobody else is online right now")]),
    );
    tables.replaceChildren(
      ...(hb.live.length
        ? hb.live.map((t) =>
          h(
            "div",
            { class: "who" },
            h("span", { text: `${t.players[0]} vs ${t.players[1]}` }),
            h("span", { class: "k", text: `${MODE_NAME[t.mode]} · shot ${t.shot}${t.watching ? ` · ${t.watching} watching` : ""}${t.corr ? " · corr" : ""}` }),
            h("button", { text: "watch", onclick: () => act.watch(t.id) }),
          )
        )
        : [empty("no tables in play")]),
    );
    if (!hb.recent.length) return mine.replaceChildren(empty("finished online matches appear here"));
    mine.replaceChildren(
      ...hb.recent.map((r) =>
        h(
          "div",
          { class: "who" },
          h("span", { text: `vs ${r.opponent}` }),
          h("span", { class: r.won ? "v" : "bad", text: `${r.won ? "won" : "lost"} · ${MODE_NAME[r.mode]} · ${venue(r.table)}` }),
          h("button", { text: "replay", onclick: () => act.replay(r.id) }),
        )
      ),
    );
  }).catch(() => people.replaceChildren(empty("hub unavailable")));
  return [
    daily,
    h("span", { class: "h", text: "ONLINE NOW · CHALLENGE AT THE VENUE AND MODE SELECTED ON PLAY" }),
    people,
    h("span", { class: "h", text: "LIVE TABLES" }),
    tables,
    h("span", { class: "h", text: "YOUR REPLAYS" }),
    mine,
  ];
}
