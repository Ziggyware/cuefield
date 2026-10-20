import type { GameState } from "../../shared/game/types.ts";
import { coins, h } from "../dom.ts";
import { ballDot, ownBalls } from "./hud-balls.ts";
import { rulesOf } from "../../shared/catalog.ts";
import { rulesList } from "./rules-text.ts";
import { statusText } from "./rules-text.ts";
import { type SayEvents, sayPanel } from "./say.ts";

export interface Seat {
  name: string;
  rating?: number;
}

export interface HudEvents extends SayEvents {
  concede(): void;
  /** Extra table buttons (replay, rewind), shown in order. */
  extra?: { text: string; fn: () => void }[];
  /** Spectators and replays have nobody to talk to. */
  noSay?: boolean;
}

export class Hud {
  root: HTMLElement;
  cards: HTMLElement[];
  clocks: HTMLElement[];
  balls: HTMLElement[];
  bubbles: (HTMLElement | null)[] = [null, null];
  mid: HTMLElement;
  info: HTMLElement;
  emotes: HTMLElement | null = null;
  card: HTMLElement | null = null;
  net: HTMLElement;
  /** Entry and pot line; replays and the daily rack rewrite it with progress. */
  stake: HTMLElement;
  st: GameState | null = null;
  /** Consecutive scoring visits by the shooter, shown from 2. */
  run = 0;

  constructor(seats: [Seat, Seat], stake: string, ev: HudEvents, unlocks: string[]) {
    this.clocks = [h("i", { class: "clock" }), h("i", { class: "clock" })];
    this.balls = [h("div", { class: "balls" }), h("div", { class: "balls" })];
    this.cards = seats.map((s, i) =>
      h(
        "div",
        { class: "pc" },
        h("div", { class: "row" }, h("span", { text: s.name }), s.rating ? h("span", { class: "k", text: s.rating }) : null),
        this.balls[i],
        this.clocks[i],
      )
    );
    this.info = h("span", { class: "k info", title: "tap for the venue rules" });
    this.info.onclick = () => {
      if (this.card) return void (this.card.remove(), (this.card = null));
      if (!this.st) return;
      this.card = h("ul", { class: "rulescard" }, ...rulesList(rulesOf(this.st.table), this.st.mode).map((t) => h("li", { text: t })));
      this.mid.append(this.card);
    };
    this.net = h("span", { class: "k net" });
    this.stake = h("span", { class: "v", text: stake });
    const emo = h("button", {
      text: "say",
      onclick: () => {
        if (this.emotes) return this.closeSay();
        this.emotes = sayPanel(unlocks, ev, () => this.closeSay());
        this.mid.append(this.emotes);
      },
    });
    const quit = h("button", { text: "quit", onclick: () => ev.concede() });
    this.mid = h(
      "div",
      { class: "mid" },
      h("div", { class: "row" }, this.stake, this.net),
      this.info,
      h("div", { class: "row" }, ...(ev.extra ?? []).map((x) => h("button", { text: x.text, onclick: x.fn })), ev.noSay ? null : emo, quit),
    );
    this.root = h("div", { class: "hud" }, this.cards[0], this.mid, this.cards[1]);
    if (seats[1].name === "") this.cards[1].style.visibility = "hidden";
  }

  update(st: GameState, active: boolean, clockFrac: number): void {
    this.st = st;
    for (const i of [0, 1] as const) {
      const on = active && st.turn === i && st.winner < 0;
      this.cards[i].classList.toggle("turn", on);
      this.clocks[i].style.width = on ? `${Math.max(0, Math.min(1, clockFrac)) * 100}%` : "0";
      this.clocks[i].style.background = clockFrac < 0.25 ? "var(--bad)" : "var(--fg)";
      const ids = ownBalls(st, i);
      const key = ids.join(",");
      if (this.balls[i].dataset.k !== key) {
        this.balls[i].dataset.k = key;
        this.balls[i].replaceChildren(...ids.map(ballDot));
      }
    }
    const text = (this.run >= 2 && st.winner < 0 ? `run ${this.run} · ` : "") + statusText(st);
    if (this.info.textContent !== text) this.info.textContent = text;
  }

  closeSay(): void {
    this.emotes?.remove();
    this.emotes = null;
  }

  /** Chat or emote: shown for 10 s or until the next message from either side replaces it. */
  bubble(seat: 0 | 1, text: string): void {
    if (!text) return;
    for (const b of this.bubbles) b?.remove();
    const b = h("div", { class: "bubble", text });
    this.cards[seat].append(b);
    this.bubbles = [null, null];
    this.bubbles[seat] = b;
    setTimeout(() => b.remove(), 10_000);
  }
}

/** Spectator reaction, floated over the centre of the HUD for a moment. */
export function cheerFlash(hud: Hud, text: string): void {
  const el = h("div", { class: "cheer", text: `▲ ${text}` });
  hud.mid.append(el);
  setTimeout(() => el.remove(), 2600);
}

/** Entry fee and what the winner collects. */
export const feeText = (fee: number) => (fee ? coins(fee) : "free");
export const stakeText = (fee: number, pot: number) => (fee ? `entry ${coins(fee)} · pot ${coins(pot)}` : pot ? `free · win ${coins(pot)}` : "free table");
