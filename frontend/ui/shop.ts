import { CUES } from "../../shared/catalog.ts";
import { MASS } from "../../shared/physics/constants.ts";
import { api, ApiError, type Profile } from "../api.ts";
import { coins, h, once, toast } from "../dom.ts";

const max = (k: "speed" | "spin" | "elev" | "guide") => Math.max(...CUES.map((c) => c[k]));
const maxWob = Math.max(...CUES.map((c) => c.wobble));
const minMass = Math.min(...CUES.map((c) => c.endMass)), maxMass = Math.max(...CUES.map((c) => c.endMass));

function stat(label: string, frac: number, value: string): HTMLElement {
  return h(
    "div",
    {},
    h("div", { class: "row" }, h("span", { class: "k", text: label }), h("span", { class: "grow" }), h("span", { text: value })),
    h("div", { class: "bar" }, h("i", { style: `width:${Math.round(frac * 100)}%` })),
  );
}

/** Cue stats map to the physics: ball speed, tip-offset limit, max elevation (massé), shaft end mass (squirt), guide length, stroke wobble. */
export function cueCards(p: Profile, refresh: (p: Profile) => void): HTMLElement {
  const cards = CUES.map((c) => {
    const owned = p.cues.includes(c.id), equipped = p.cue === c.id;
    const elevDeg = Math.round((2 * Math.atan(c.elev / 1e4) * 180) / Math.PI);
    const act = once(async () => {
      try {
        if (owned) refresh(await api<Profile>("/me/equip", { id: c.id }));
        else if (p.coins < c.price) toast(`needs ${coins(c.price)}`);
        else if (confirm(`Buy ${c.id} for ${coins(c.price)}?`)) refresh(await api<Profile>("/me/buy", { kind: "cue", id: c.id }));
      } catch (e) {
        toast(e instanceof ApiError ? e.code : "error");
      }
    });
    return h(
      "div",
      { class: `card${equipped ? " sel" : ""}` },
      h("div", { class: "swatch", style: `background:linear-gradient(90deg,#3b6fb0 0 2%,#f4f2ea 2% 4%,${c.shaft} 4% 50%,${c.ring} 50% 52%,${c.butt} 52%)` }),
      h(
        "div",
        { class: "row" },
        h("span", { text: c.id }),
        h("span", { class: "grow" }),
        h("span", { class: "v", text: owned ? (equipped ? "equipped" : "") : coins(c.price) }),
      ),
      stat("power", c.speed / max("speed"), `${(((1 + c.tipE) * c.speed) / (1 + MASS / c.mass)).toFixed(1)} m/s`),
      stat("spin", c.spin / max("spin"), `${Math.round(c.spin * 100)}% R`),
      stat("massé", c.elev / max("elev"), `${elevDeg}°`),
      stat("low deflection", 1 - (c.endMass - minMass) / (maxMass - minMass) * 0.85, `${(c.endMass * 1000).toFixed(1)} g`),
      stat("guide", c.guide / max("guide"), `${Math.round(c.guide * 100)} cm`),
      stat("steadiness", 1.15 - c.wobble / maxWob, `σ ${(c.wobble * 1000).toFixed(1)} mrad`),
      equipped ? null : h("button", { class: owned ? "" : "primary", text: owned ? "equip" : "buy", onclick: act }),
    );
  });
  return h("div", { class: "grid" }, ...cards);
}
