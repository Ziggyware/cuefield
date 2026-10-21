import type { CueSpec } from "../../shared/catalog.ts";
import type { GameState } from "../../shared/game/types.ts";
import { cueChips } from "../../shared/upgrades.ts";
import { coins, h } from "../dom.ts";
import { ballDot, ownBalls } from "./hud-balls.ts";
import { rulesOf } from "../../shared/catalog.ts";
import { rulesList } from "./rules-text.ts";
import { statusText } from "./rules-text.ts";
import { type SayEvents, sayPanel } from "./say.ts";

export interface Seat {
  name: string;
  rating?: number;
  /** Effective cue (upgrades included). Its badges tell the table what the player has enabled. */
  cue?: CueSpec;
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
  /** Left dock, immediately right of seat 0: the chalk selections live here. */
  chalk: HTMLElement;
  /** Right dock, immediately left of seat 1: spin and massé live here. */
  cue: HTMLElement;
  private seats: [Seat, Seat];
  private ups: HTMLElement[];
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
    this.seats = seats;
    this.clocks = [h("i", { class: "clock" }), h("i", { class: "clock" })];
    this.balls = [h("div", { class: "balls" }), h("div", { class: "balls" })];
    this.ups = [h("div", { class: "ups" }), h("div", { class: "ups" })];
    this.cards = seats.map((s, i) =>
      h(
        "div",
        { class: "pc" },
        h("div", { class: "row" }, h("span", { text: s.name }), s.rating ? h("span", { class: "k", text: s.rating }) : null),
        this.ups[i],
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
    this.chalk = h("div", { class: "dock chalk-dock", title: "chalk selections" });
    this.cue = h("div", { class: "dock cue-dock", title: "spin and massé" });
    this.root = h("div", { class: "hud" }, this.cards[0], this.chalk, this.mid, this.cue, this.cards[1]);
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
      const cue = this.seats[i].cue;
      const ck = cue ? cue.id + "|" + cue.speed + "," + cue.spin + "," + cue.elev + "," + cue.endMass + "," + cue.guide + "," + cue.mass + "," + cue.wobble + "," + cue.luck + "," + cue.finish : "";
      if (this.ups[i].dataset.k !== ck) {
        this.ups[i].dataset.k = ck;
        const chips = cue ? cueChips(cue) : [];
        this.ups[i].replaceChildren(
          ...chips.map((c) =>
            h("i", {
              class: `up up-${c.id}`,
              title: `${c.name} ${c.level}/${5}`,
              text: `${c.short}${c.level}`,
              style: c.id === "color" && cue ? `background:${cue.ring};color:#08090a` : undefined,
            }),
          ),
        );
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
