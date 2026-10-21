import { awardList, matchStats, narrate } from "./rewards.ts";
import { api } from "../api.ts";
import { linkTo, share } from "../links.ts";
import { coins, h, modal } from "../dom.ts";
import type { MatchView } from "../game/match-view.ts";
import { END_TEXT } from "./rules-text.ts";

const REASON: Record<string, string> = {
  win: "",
  concede: "conceded",
  forfeit: "disconnected",
  timeouts: "shot clock",
  abandoned: "both players left · entry refunded",
};

export function showResult(v: MatchView, seat: 0 | 1, lobby: () => void, next: (id: string) => void): void {
  const won = v.winner === seat, noResult = v.winner < 0;
  narrate(noResult ? "Match ended without a result." : `${v.players[v.winner].name} wins. Here are your match highlights.`);
  const status = h("span", { class: "k" });
  let polling = 0;
  const again = h("button", {
    class: "primary",
    text: "rematch",
    onclick: () => {
      again.disabled = true;
      status.textContent = "waiting for opponent";
      const poll = async () => {
        try {
          const r = await api<{ next: string | null }>(`/match/${v.id}/rematch`, {});
          if (r.next && r.next !== "pending" && r.next !== "none") {
            m.close();
            next(r.next);
            return;
          }
          if (r.next === "none") {
            status.textContent = "rematch unavailable";
            return;
          }
        } catch {
          /* retry */
        }
        polling = setTimeout(poll, 1500);
      };
      poll();
    },
  });
  const m = modal(
    h("div", { class: "big", text: noResult ? "no result" : won ? "won" : "lost" }),
    h("span", { class: "k", text: REASON[v.reason ?? ""] || END_TEXT[v.state.last?.end ?? ""] || "" }),
    h(
      "div",
      { class: "row" },
      h("span", { class: "k", text: v.players[1 - seat].name }),
      h("span", { class: "grow" }),
      // Net change: the winner's pot minus their own escrowed entry equals the loser's entry.
      h("span", { class: won ? "v" : "bad", text: !v.stake || noResult ? "" : won ? `+${coins(v.stake)}` : `−${coins(v.stake)}` }),
    ),
    matchStats(v.state, v.players.map((p) => p.name)),
    awardList(v.bonuses ?? []),
    status,
    h(
      "div",
      { class: "row" },
      noResult ? null : again,
      h("button", { text: "share replay", onclick: () => share(linkTo("replay", v.id), `${v.players[0].name} vs ${v.players[1].name}`) }),
      h("button", {
        text: "lobby",
        "data-esc": true,
        onclick: () => {
          clearTimeout(polling);
          m.close();
          lobby();
        },
      }),
    ),
  );
}
