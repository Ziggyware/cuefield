import { cueById, type CueSpec } from "../../shared/catalog.ts";
import { MASS } from "../../shared/physics/constants.ts";
import { SOCIAL } from "../../shared/social.ts";
import { effectiveCue, FINISHES, levelOf, MAX_LEVEL, type Track, UPGRADES } from "../../shared/upgrades.ts";
import { api, ApiError, type Profile } from "../api.ts";
import { coins, h, once, toast } from "../dom.ts";
import { cueCards } from "./shop.ts";

type Tab = "upgrades" | "cues" | "social";
let tab: Tab = "upgrades";

/** One purchase in flight at a time: a double tap must not race itself into a false "not enough coins". */
const spend = once(async (path: string, body: unknown, refresh: (p: Profile) => void) => {
  try {
    refresh(await api<Profile>(path, body));
  } catch (e) {
    toast(e instanceof ApiError ? (e.code === "coins" ? "not enough coins" : e.code) : "error");
  }
});

/** Centre-hit ball speed at full stroke: v = (1+e)V / (1 + M/m). */
const ballSpeed = (c: CueSpec) => ((1 + c.tipE) * c.speed) / (1 + MASS / c.mass);

/** Live value of each track on the equipped cue after upgrades. */
const VALUE: Record<Track, (c: CueSpec) => string> = {
  power: (c) => `${ballSpeed(c).toFixed(2)} m/s`,
  spin: (c) => `${Math.round(c.spin * 100)}% R · e ${c.tipE.toFixed(2)}`,
  masse: (c) => `${Math.round((2 * Math.atan(c.elev / 1e4) * 180) / Math.PI)}°`,
  control: (c) => `${(c.endMass * 1000).toFixed(1)} g`,
  guide: (c) => `${Math.round(c.guide * 100)} cm`,
  weight: (c) => `${Math.round(c.mass * 1000)} g`,
  handle: (c) => `σ ${(c.wobble * 1000).toFixed(2)} mrad`,
  luck: (c) => `${(c.luck * 1000).toFixed(1)} mm`,
  color: (c) => `finish ${c.finish}`,
};

/** Upgrade tracks apply to whichever cue is equipped. */
function upgrades(p: Profile, refresh: (p: Profile) => void): HTMLElement {
  const cue = effectiveCue(cueById(p.cue), p.upgrades);
  return h(
    "div",
    { class: "grid" },
    ...UPGRADES.map((u) => {
      const lvl = levelOf(p.upgrades, u.id), cost = u.costs[lvl];
      const fin = u.id === "color" ? FINISHES[Math.min(MAX_LEVEL, lvl + 1)] : null;
      return h(
        "div",
        { class: "card" },
        h("div", { class: "row" }, h("span", { text: u.name }), h("span", { class: "grow" }), h("span", { class: "v", text: VALUE[u.id](cue) })),
        h("div", { class: "pips" }, ...Array.from({ length: MAX_LEVEL }, (_, i) => h("i", { class: i < lvl ? "on" : "" }))),
        h("span", { class: "k", text: `per level: ${u.step}` }),
        fin && lvl < MAX_LEVEL
          ? h("div", { class: "swatch", style: `background:linear-gradient(90deg,${fin[0]} 0 50%,${fin[2]} 50% 53%,${fin[1]} 53%)` })
          : null,
        lvl >= MAX_LEVEL ? h("span", { class: "k", text: "max" }) : h("button", {
          class: p.coins >= cost ? "primary" : "",
          text: `level ${lvl + 1} · ${coins(cost)}`,
          onclick: () => spend("/me/upgrade", { track: u.id }, refresh),
        }),
      );
    }),
  );
}

/** Emote packs and free chat for the table HUD. */
function social(p: Profile, refresh: (p: Profile) => void): HTMLElement {
  return h(
    "div",
    { class: "grid" },
    ...SOCIAL.map((s) => {
      const owned = s.price === 0 || p.unlocks.includes(s.id);
      return h(
        "div",
        { class: `card${owned ? " sel" : ""}` },
        h(
          "div",
          { class: "row" },
          h("span", { text: s.name }),
          h("span", { class: "grow" }),
          h("span", { class: "v", text: owned ? "owned" : coins(s.price) }),
        ),
        h("span", { class: "k", text: s.lines.length ? s.lines.join(" · ") : "type your own messages at the table, 60 characters" }),
        owned ? null : h("button", {
          class: p.coins >= s.price ? "primary" : "",
          text: `unlock · ${coins(s.price)}`,
          onclick: () => spend("/me/buy", { kind: "social", id: s.id }, refresh),
        }),
      );
    }),
  );
}

/** Store tab: upgrade tracks, cues and social unlocks. */
export function store(p: Profile, refresh: (p: Profile) => void): HTMLElement[] {
  const tabs = (["upgrades", "cues", "social"] as Tab[]).map((t) =>
    h("button", { class: tab === t ? "on" : "", text: t.toUpperCase(), onclick: () => ((tab = t), refresh(p)) })
  );
  const body = tab === "upgrades" ? upgrades(p, refresh) : tab === "cues" ? cueCards(p, refresh) : social(p, refresh);
  return [h("div", { class: "seg" }, ...tabs), body];
}
