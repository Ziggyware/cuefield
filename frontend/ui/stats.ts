import { type Mode, MODE_NAME, tableById } from "../../shared/catalog.ts";
import { api, type GlobalStats, type MatchResult, type PlayerStats, type Profile } from "../api.ts";
import { coins, h } from "../dom.ts";

export function ago(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}

const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
const cell = (k: string, v: string | number, cls = "") => h("div", { class: "stat" }, h("span", { class: "k", text: k }), h("span", { class: cls, text: v }));
const venueName = (id: string) => tableById(id)?.name ?? id;

/** Competitive record from the profile, with rank and win rate filled in when /me/stats answers. */
export function myStrip(p: Profile): HTMLElement {
  const rank = cell("rank", "–"), win = cell("win", "–");
  const strip = h(
    "div",
    { class: "stats" },
    cell("elo", p.rating, "v"),
    rank,
    cell("online", `${p.wins}–${p.losses}`),
    win,
    cell("streak", `${p.winStreak} · best ${p.bestStreak}`),
    cell("vs bot", `${p.botWins}–${p.botLosses}`),
    cell("net", `${p.earned >= 0 ? "+" : ""}${coins(p.earned)}`, p.earned >= 0 ? "v" : "bad"),
  );
  api<PlayerStats>("/me/stats").then((s) => {
    rank.lastElementChild!.textContent = s.rank ? `#${s.rank} of ${s.of}` : "unrated";
    win.lastElementChild!.textContent = pct(s.winPct);
  }).catch(() => {});
  return strip;
}

/** One finished match as a table row; `won` set means the list is the viewer's own. */
export function resultRow(r: MatchResult): HTMLElement {
  const who = r.won === undefined
    ? h("td", {}, h("span", { class: "v", text: r.winner }), h("span", { class: "k", text: " beat " }), h("span", { text: r.loser }))
    : h("td", {}, h("span", { class: r.won ? "v" : "bad", text: r.won ? "W " : "L " }), h("span", { text: r.won ? r.loser : r.winner }));
  const reason = r.reason && r.reason !== "win" ? ` · ${r.reason}` : "";
  return h(
    "tr",
    {},
    who,
    h("td", { class: "k", text: `${MODE_NAME[r.mode as Mode]?.toLowerCase() ?? r.mode} · ${venueName(r.table)}${reason}` }),
    h("td", { text: r.pot ? coins(r.pot) : "" }),
    h("td", { class: "k", text: ago(r.ended) }),
  );
}

/** Site-wide activity, the top of the ladder, and the latest results across every venue. */
export function globalPanel(stats: Promise<GlobalStats>): HTMLElement {
  const nums = h("div", { class: "stats" });
  const top = h("table", { class: "list" });
  const recent = h("table", { class: "list" });
  const box = h(
    "div",
    { class: "col" },
    h("span", { class: "h", text: "GLOBAL" }),
    nums,
    h("span", { class: "h", text: "TOP RATED" }),
    top,
    h("span", { class: "h", text: "LATEST RESULTS" }),
    recent,
  );
  stats.then((s) => {
    nums.replaceChildren(
      cell("players", s.players),
      cell("live tables", s.live, "v"),
      cell("searching", s.queued),
      cell("racks 24h", s.today.online + s.today.bot),
      cell("paid 24h", coins(s.today.paid), "v"),
      ...(s.streak ? [cell("longest streak", `${s.streak.n} · ${s.streak.name}`)] : []),
    );
    top.replaceChildren(
      ...s.top.map((r, i) =>
        h(
          "tr",
          {},
          h("td", { class: "k", text: i + 1 }),
          h("td", { text: r.name }),
          h("td", { class: "k", text: `${r.wins}–${r.losses}` }),
          h("td", { text: r.rating }),
        )
      ),
    );
    if (!s.top.length) top.replaceChildren(h("tr", {}, h("td", { class: "k", text: "no rated games yet" })));
    recent.replaceChildren(...s.recent.map(resultRow));
    if (!s.recent.length) recent.replaceChildren(h("tr", {}, h("td", { class: "k", text: "no results yet" })));
  }).catch(() => nums.replaceChildren(h("span", { class: "k", text: "stats unavailable" })));
  return box;
}
