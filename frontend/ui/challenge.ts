import { type AssistLevel, MODE_NAME, tableById } from "../../shared/catalog.ts";
import { api, ApiError } from "../api.ts";
import { h, modal, once, toast } from "../dom.ts";
import type { Invite, OnlinePlayer } from "../net/hub.ts";
import { choose, GUIDES } from "./host.ts";
import { pref } from "./matchmaking.ts";
import type { LobbyActions } from "./play.ts";

const err = (e: unknown) => toast(e instanceof ApiError ? (e.code === "coins" ? "not enough coins for that venue" : e.code) : "network error");

/** Waits on a real-time challenge until it is answered, expires or is withdrawn. */
function awaitAnswer(id: string, who: string, act: LobbyActions) {
  let open = true, timer = 0;
  const stop = () => {
    open = false;
    clearTimeout(timer);
    m.close();
  };
  const m = modal(
    h("span", { text: `waiting for ${who}` }),
    h("span", { class: "k", text: "the challenge lapses after two minutes" }),
    h("button", { text: "withdraw", "data-esc": true, onclick: () => (stop(), api(`/challenge/${id}/cancel`, {}).catch(() => {})) }),
  );
  const loop = async () => {
    if (!open) return;
    try {
      const r = await api<{ status: string; match: string | null }>(`/challenge/${id}`);
      if (r.match) return stop(), act.match(r.match);
      if (r.status !== "open" && r.status !== "accepted") return stop(), toast(`${who}: ${r.status}`);
    } catch {
      /* retry */
    }
    timer = setTimeout(loop, 1500);
  };
  loop();
}

/** Challenge an online player at the selected venue and mode; correspondence games are answered within a day. */
export function challengeModal(to: OnlinePlayer, act: LobbyActions): void {
  const spec = tableById(pref.table)!;
  const [guide, assist] = choose(GUIDES, spec.assist as AssistLevel);
  const [pace, corr] = choose([[false, "real-time"], [true, "correspondence · 1 day/shot"]], false);
  const send = once(async () => {
    try {
      const c = corr();
      const { id } = await api<{ id: string }>("/challenge", { to: to.id, mode: pref.mode, table: spec.id, assist: assist(), corr: c });
      m.close();
      if (c) toast(`sent · ${to.name} has a day to accept`, 2600);
      else awaitAnswer(id, to.name, act);
    } catch (e) {
      err(e);
    }
  });
  const m = modal(
    h("div", { class: "big", text: `challenge ${to.name}` }),
    h("span", { class: "k", text: `${MODE_NAME[pref.mode]} · ${spec.name} · entry ${spec.fee}c each (pick both on the play tab)` }),
    h("span", { class: "h", text: "PREDICTION FOR BOTH" }),
    guide,
    h("span", { class: "h", text: "PACE" }),
    pace,
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary grow", text: "send", onclick: send }),
      h("button", { text: "cancel", "data-esc": true, onclick: () => m.close() }),
    ),
  );
}

/** Incoming challenge row: accepting opens the match at once (fees are escrowed from both). */
export function inviteBanner(inv: Invite, act: LobbyActions, gone: () => void): HTMLElement {
  const spec = tableById(inv.table);
  const answer = once(async (accept: boolean) => {
    try {
      const r = await api<{ match: string | null }>(`/challenge/${inv.id}/${accept ? "accept" : "decline"}`, {});
      gone();
      if (r.match) act.match(r.match);
    } catch (e) {
      gone();
      err(e);
    }
  });
  const what = `${MODE_NAME[inv.mode]} · ${spec?.name ?? inv.table} · prediction ${inv.assist}${inv.corr ? " · correspondence" : ""}`;
  return h(
    "div",
    { class: "banner" },
    h("span", {}, h("b", { text: `${inv.from} challenges you` }), h("br"), h("small", { class: "k", text: what })),
    h("button", { class: "primary", text: "accept", onclick: () => answer(true) }),
    h("button", { text: "decline", onclick: () => answer(false) }),
  );
}
