import { rewardsPanel } from "./rewards.ts";
import { type AssistLevel, botPot, type Mode, MODE_NAME, MODES, onlinePot, tableById, TABLES } from "../../shared/catalog.ts";
import { api, type GlobalStats, type Profile } from "../api.ts";
import type { Level } from "../bot/plan.ts";
import { coins, h, toast } from "../dom.ts";
import { prefs, setPref } from "../prefs/store.ts";
import { pref, quick } from "./matchmaking.ts";
import { choose, GUIDES, hostModal, roomModal } from "./host.ts";
import { feeText } from "./hud.ts";
import { ASSIST_NAME, ASSIST_SHORT, rulesList } from "./rules-text.ts";

export interface LobbyActions {
  match(id: string): void;
  practice(mode: Mode, table: string, level: Level): void;
  solo(mode: Mode, table: string, assist: AssistLevel): void;
  watch(id: string): void;
  replay(id: string): void;
  daily(): void;
  refresh(p: Profile): void;
}

/** Lobby counters change slowly; one fetch serves every re-render for this long. */
const STATS_TTL_MS = 15_000;
let stats: { at: number; v: Promise<GlobalStats> } | null = null;
const globalStats = () => {
  if (!stats || Date.now() - stats.at > STATS_TTL_MS) stats = { at: Date.now(), v: api<GlobalStats>("/stats") };
  stats.v.catch(() => (stats = null));
  return stats.v;
};

const LEVELS = ["easy", "club", "pro"];
const FEET: Record<string, string> = { "1.981": "7ft", "2.235": "8ft", "2.54": "9ft" };
const css = (c: number[]) => `rgb(${c.map((v) => Math.round(v * 255)).join(",")})`;

/** Venue list for the main area and the always-visible action dock. */
export function play(p: Profile, act: LobbyActions): { main: HTMLElement[]; dock: HTMLElement } {
  if (!tableById(pref.table)) setPref("lastVenue", "garage");
  const spec = tableById(pref.table)!, level = prefs.botLevel as Level;
  const live = h("span", { class: "k" });
  globalStats().then((s) => (live.textContent = `${s.players} players · ${s.live} live tables · ${s.queued} searching`)).catch(() => {});

  const venues = TABLES.map((t) => {
    const sel = t.id === spec.id;
    return h(
      "button",
      { class: `venue${sel ? " sel" : ""}`, onclick: () => (setPref("lastVenue", t.id), act.refresh(p)) },
      h("i", { class: "sw", style: `background:${css(t.cloth)};border-color:${css(t.rail)}` }),
      h("span", {}, h("b", { text: t.name }), h("span", { class: "sub", text: `T${t.tier} · ${FEET[String(t.L)] ?? ""} · ${ASSIST_NAME[t.assist]}` })),
      h(
        "span",
        { style: "text-align:right" },
        h("b", { class: p.coins < t.fee ? "bad" : "", text: feeText(t.fee) }),
        h("span", { class: "sub", text: t.fee ? `pot ${coins(onlinePot(t))}` : "no stake" }),
      ),
      sel ? h("ul", { class: "rules" }, ...rulesList(t.rules, pref.mode).map((r) => h("li", { text: r }))) : null,
    );
  });

  const short = p.coins < spec.fee;
  const need = () => toast(`entry is ${coins(spec.fee)} · claim the daily reward or pick a cheaper venue`, 2800);
  const mode = h(
    "div",
    { class: "seg" },
    ...MODES.map((m) => h("button", { class: pref.mode === m ? "on" : "", text: MODE_NAME[m], onclick: () => (setPref("lastMode", m), act.refresh(p)) })),
  );
  const btn = (label: string, sub: string, primary: boolean, fn: () => void) =>
    h("button", { class: primary ? "primary" : "", onclick: fn }, h("span", { text: label }), h("small", { text: sub }));
  const dock = h(
    "div",
    { class: "dock" },
    mode,
    h(
      "div",
      { class: "acts" },
      btn("QUICK MATCH", spec.fee ? `${coins(spec.fee)} → ${coins(onlinePot(spec))}` : "free · no stake", true, () => (short ? need() : quick(act))),
      btn(
        `VS BOT · ${LEVELS[level].toUpperCase()}`,
        `${feeText(spec.fee)} → ${coins(botPot(spec, level))} · ${ASSIST_SHORT[spec.assist]}`,
        true,
        () => {
          if (short) return need();
          const [diff, pick] = choose(LEVELS.map((l, i) => [i as Level, l] as [Level, string]), level);
          hostModal(
            "vs bot",
            [h("span", { class: "h", text: "DIFFICULTY" }), diff, h("span", { class: "k", text: `prediction: ${ASSIST_NAME[spec.assist]} (venue)` })],
            "play",
            () => {
              setPref("botLevel", pick());
              act.practice(pref.mode, pref.table, pick());
            },
          );
        },
      ),
      btn("PRACTICE", `free · prediction ${prefs.practiceGuide}`, false, () => {
        const [guide, pick] = choose(GUIDES, prefs.practiceGuide as AssistLevel);
        hostModal("practice", [h("span", { class: "h", text: "PREDICTION" }), guide], "start", () => {
          setPref("practiceGuide", pick());
          act.solo(pref.mode, pref.table, pick());
        });
      }),
      btn("PRIVATE ROOM", "host or join · set prediction", false, () => (short ? need() : roomModal(act, spec.assist))),
    ),
  );
  return { main: [h("span", { class: "h", text: "VENUES" }), ...venues, live, rewardsPanel(p)], dock };
}
