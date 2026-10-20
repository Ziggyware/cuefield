import type { AssistLevel } from "../../shared/catalog.ts";
import { h, modal } from "../dom.ts";
import { join, room } from "./matchmaking.ts";
import type { LobbyActions } from "./play.ts";
import { ASSIST_SHORT } from "./rules-text.ts";

/** Segmented chooser; returns the element and a getter for the picked value. */
export function choose<T>(opts: [T, string][], cur: T): [HTMLElement, () => T] {
  let v = cur;
  const btns = opts.map(([val, label]) => {
    const b = h("button", { class: val === cur ? "on" : "", text: label });
    b.onclick = () => {
      v = val;
      btns.forEach((x, i) => x.classList.toggle("on", opts[i][0] === val));
    };
    return b;
  });
  return [h("div", { class: "seg col4" }, ...btns), () => v];
}

export const GUIDES = ([4, 3, 2, 1] as AssistLevel[]).map((l) => [l, `${l} · ${ASSIST_SHORT[l]}`] as [AssistLevel, string]);

/** Host settings before a game starts: prediction for rooms and practice, difficulty for the bot. */
export function hostModal(title: string, kids: HTMLElement[], go: string, start: () => void): void {
  const m = modal(
    h("div", { class: "big", text: title }),
    ...kids,
    h(
      "div",
      { class: "row" },
      h("button", { class: "primary grow", text: go, onclick: () => (m.close(), start()) }),
      h("button", { text: "cancel", "data-esc": true, onclick: () => m.close() }),
    ),
  );
}

export function roomModal(act: LobbyActions, venue: AssistLevel): void {
  const [guide, pick] = choose(GUIDES, venue);
  const [pace, corr] = choose([[false, "real-time"], [true, "correspondence · 1 day/shot"]], false);
  const code = h("input", { placeholder: "CODE", maxlength: 6, style: "text-transform:uppercase;letter-spacing:.3em" }) as HTMLInputElement;
  const m = modal(
    h("div", { class: "big", text: "private room" }),
    h("span", { class: "h", text: "PREDICTION FOR BOTH PLAYERS" }),
    guide,
    h("span", { class: "h", text: "PACE" }),
    pace,
    h("button", { class: "primary", text: "create room", onclick: () => (m.close(), room(act, pick(), corr())) }),
    h("span", { class: "h", text: "OR JOIN A FRIEND" }),
    h("div", { class: "row" }, code, h("button", { text: "join", onclick: () => (m.close(), join(code.value, act)) })),
    h("button", { text: "close", "data-esc": true, onclick: () => m.close() }),
  );
}
