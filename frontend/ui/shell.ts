import { api, type Profile, valTownLogin } from "../api.ts";
import { coins, countdown, h, once, toast } from "../dom.ts";
import { live } from "./live.ts";
import { pulseBar } from "./pulse.ts";
import { boards } from "./boards.ts";
import { type LobbyActions, play } from "./play.ts";
import { settings } from "./settings.ts";
import { store } from "./store.ts";

export type Tab = "play" | "live" | "rank" | "store" | "settings";
const TABS: Tab[] = ["play", "live", "rank", "store", "settings"];

export interface ShellActions extends LobbyActions {
  tab(t: Tab): void;
}

let scrollKeep: Record<string, number> = {};

/** App frame: identity and coins on top, the tab's content in the middle, the action dock and tab bar pinned. */
export function shell(p: Profile, tab: Tab, act: ShellActions): HTMLElement {
  const name = p.account === "valtown" || !valTownLogin
    ? h("span", { class: "name", text: p.name })
    : h("button", { class: "name", text: `${p.name} · log in`, onclick: () => (location.href = "/auth/login") });
  const readyAt = Date.now() + p.daily;
  const daily = h("button", {
    onclick: once(async () => {
      try {
        const r = await api<{ amount: number; profile: Profile }>("/me/daily", {});
        toast(`+${coins(r.amount)}`);
        act.refresh(r.profile);
      } catch {
        toast("not yet");
      }
    }),
  });
  /** Live countdown; the button arms itself when the reward comes due. */
  const paint = () => {
    const left = readyAt - Date.now();
    daily.disabled = left > 0;
    daily.className = left > 0 ? "" : "primary";
    daily.textContent = left > 0 ? countdown(left) : "+ daily";
    if (daily.isConnected || !daily.dataset.t) setTimeout(paint, 1000 - (Date.now() % 1000));
    daily.dataset.t = "1";
  };
  paint();
  const top = h(
    "header",
    { class: "top" },
    name,
    h("span", { class: "k", text: `LV ${p.progression?.level ?? 1} · ${p.rating} Elo` }),
    h("span", { style: "flex:1" }),
    h("b", { class: "v", text: coins(p.coins) }),
    daily,
  );

  let content: HTMLElement[], dock: HTMLElement | null = null;
  if (tab === "play") ({ main: content, dock } = play(p, act));
  else if (tab === "live") content = live(p, act);
  else if (tab === "rank") content = boards(p);
  else if (tab === "store") content = store(p, act.refresh);
  else content = settings(p, act.refresh);

  const main = h("main", { class: "main" }, tab === "play" || tab === "live" ? pulseBar(act) : null, ...content);
  main.addEventListener("scroll", () => (scrollKeep[tab] = main.scrollTop));
  requestAnimationFrame(() => (main.scrollTop = scrollKeep[tab] ?? 0));
  const nav = h(
    "nav",
    { class: "tabs" },
    ...TABS.map((t) =>
      h("button", { class: t === tab ? "cur" : "", text: t.toUpperCase(), onclick: () => (t === tab ? main.scrollTo({ top: 0 }) : act.tab(t)) })
    ),
  );
  return h("div", { class: "app" }, top, main, dock, nav);
}

export function resetScroll(): void {
  scrollKeep = {};
}
