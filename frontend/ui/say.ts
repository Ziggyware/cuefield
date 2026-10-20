import { CHAT_MAX, cleanChat, SOCIAL } from "../../shared/social.ts";
import { h } from "../dom.ts";

export interface SayEvents {
  emote(key: string): void;
  chat(text: string): void;
}

/** Emote lines from every owned pack, plus a free-text field once chat is unlocked. */
export function sayPanel(unlocks: string[], ev: SayEvents, close: () => void): HTMLElement {
  const packs = SOCIAL.filter((s) => s.lines.length && (s.price === 0 || unlocks.includes(s.id)));
  const rows = packs.map((p) =>
    h(
      "div",
      { class: "emotes" },
      ...p.lines.map((t, i) =>
        h("button", {
          text: t,
          onclick: () => {
            ev.emote(`${p.id}:${i}`);
            close();
          },
        })
      ),
    )
  );
  let chat: HTMLElement | null = null;
  if (unlocks.includes("chat")) {
    const input = h("input", { maxlength: CHAT_MAX, placeholder: "message", enterkeyhint: "send" }) as HTMLInputElement;
    const send = () => {
      const t = cleanChat(input.value);
      if (!t) return;
      ev.chat(t);
      close();
    };
    input.addEventListener("keydown", (e) => e.key === "Enter" && send());
    chat = h("div", { class: "row" }, input, h("button", { class: "primary", text: "send", onclick: send }));
    setTimeout(() => input.focus(), 0);
  }
  return h("div", { class: "say" }, ...rows, chat);
}
