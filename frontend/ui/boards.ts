import { tableById } from "../../shared/catalog.ts";
import { api, type GlobalStats, type PlayerStats, type Profile } from "../api.ts";
import { h } from "../dom.ts";
import { globalPanel, myStrip, resultRow } from "./stats.ts";

interface Rank {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
}

/** Rank tab: your record, site-wide activity, your venues and results, and the ladder. */
export function boards(p: Profile): HTMLElement[] {
  const rank = h("table", { class: "list" });
  const venues = h("table", { class: "list" });
  const past = h("table", { class: "list" });
  api<Rank[]>("/leaderboard").then((rows) =>
    rank.replaceChildren(
      ...rows.map((r, i) =>
        h(
          "tr",
          { class: r.id === p.id ? "v" : "" },
          h("td", { class: "k", text: i + 1 }),
          h("td", { text: r.name }),
          h("td", { class: "k", text: `${r.wins}–${r.losses}` }),
          h("td", { text: r.rating }),
        )
      ),
    )
  ).catch(() => {});
  api<PlayerStats>("/me/stats").then((s) => {
    venues.replaceChildren(
      ...s.venues.map((v) => {
        const n = v.w + v.l;
        return h(
          "tr",
          {},
          h("td", { text: tableById(v.id)?.name ?? v.id }),
          h("td", { class: "k", text: `${v.w}–${v.l}` }),
          h("td", { text: n ? `${Math.round((100 * v.w) / n)}%` : "–" }),
        );
      }),
    );
    past.replaceChildren(...s.recent.map(resultRow));
    if (!s.recent.length) past.replaceChildren(h("tr", {}, h("td", { class: "k", text: "no finished matches yet" })));
  }).catch(() => {});
  return [
    h("span", { class: "h", text: "YOU" }),
    myStrip(p),
    h("span", { class: "h", text: "BY VENUE" }),
    venues,
    h("span", { class: "h", text: "YOUR RESULTS" }),
    past,
    globalPanel(api<GlobalStats>("/stats")),
    h("span", { class: "h", text: "LADDER" }),
    rank,
  ];
}
