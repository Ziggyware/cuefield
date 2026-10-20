import { MODE_NAME } from "../../shared/catalog.ts";
import { api } from "../api.ts";
import { h, toast } from "../dom.ts";
import type { Pulse } from "../net/hub.ts";
import { inviteBanner } from "./challenge.ts";
import type { LobbyActions } from "./play.ts";

const POLL_MS = 5000;
const seen = new Set<string>();

/**
 * Menu strip for what needs the player: matches they sit in (resumable from any device) and challenges waiting
 * for them. Polls while it is on screen and stops once the menu is replaced.
 */
export function pulseBar(act: LobbyActions): HTMLElement {
  const el = h("div", { class: "col" });
  const render = (p: Pulse) => {
    const rows: HTMLElement[] = p.active.map((m) =>
      h(
        "div",
        { class: "banner" },
        h(
          "span",
          {},
          h("b", { text: `vs ${m.opponent}` }),
          h("br"),
          h("small", {
            class: m.yourTurn ? "v" : "k",
            text: `${MODE_NAME[m.mode]} · ${m.corr ? "correspondence · " : ""}${m.yourTurn ? "your shot" : "their shot"}`,
          }),
        ),
        h("button", { class: "primary", text: "resume", onclick: () => act.match(m.id) }),
      )
    );
    for (const inv of p.invites) {
      if (!seen.has(inv.id)) {
        seen.add(inv.id);
        toast(`${inv.from} challenges you`, 2400);
      }
      rows.push(inviteBanner(inv, act, () => loop()));
    }
    el.replaceChildren(...rows);
  };
  let timer = 0;
  const loop = async () => {
    clearTimeout(timer);
    try {
      const p = await api<Pulse>("/pulse");
      if (!el.isConnected && timer) return;
      render(p);
    } catch {
      /* offline: keep the last strip */
    }
    timer = setTimeout(() => el.isConnected && loop(), POLL_MS);
  };
  loop();
  return el;
}
