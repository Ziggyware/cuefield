import { BOUNTIES, MULTIPOT_PER_EXTRA, bragging, emptyStats, type RackStats } from "../../shared/rewards.ts";
import type { GameState } from "../../shared/game/types.ts";
import { api, type Profile } from "../api.ts";
import { coins, h } from "../dom.ts";

export interface Award { title: string; amount: number }
export function awardList(awards: Award[]): HTMLElement {
  return h("div", { class: "award-list" }, ...awards.map((a) => h("div", { class: "reward-line" }, h("span", { text: a.title }), h("b", { class: "v", text: `+${coins(a.amount)} · +${a.amount} XP` }))));
}
export function matchStats(st: GameState, names: string[]): HTMLElement {
  return h("section", { class: "match-stats", "aria-label": "Match statistics" },
    ...names.map((name, i) => {
      const s: RackStats = st.stats?.[i] ?? emptyStats();
      return h("article", { class: "player-recap" },
        h("span", { class: "k", text: i === st.winner ? "CHAMPION" : "CHALLENGER" }),
        h("h3", { text: name }),
        h("div", { class: "recap-numbers", text: `${s.pots} pots · ${s.shots} shots · ${s.fouls} fouls` }),
        h("div", { class: "k", text: `Best visit: ${s.bestRun} balls · Best drop: ${s.multi}` }),
        ...bragging(s, i === st.winner).map((text) => h("span", { class: "brag", text })),
      );
    }));
}
export function rewardsPanel(p: Profile): HTMLElement {
  const prog = p.progression ?? { level: 1, xp: 0, floor: 0, next: 250, progress: 0 };
  const goals = h("div", { class: "bounty-grid" }, h("span", { class: "k", text: "Loading daily progress…" }));
  api<{ resets: number; goals: (typeof BOUNTIES[number] & { progress: number; claimed: boolean })[] }>("/me/rewards").then((r) => {
    goals.replaceChildren(...r.goals.map((b) => h("div", { class: `bounty${b.claimed ? " claimed" : ""}` },
      h("span", { class: "k", text: b.daily ? "DAILY CONTRACT" : "MATCH BOUNTY" }),
      h("b", { text: b.title }),
      h("span", { class: "v", text: `+${coins(b.amount)} · +${b.amount} XP` }),
      b.daily ? h("span", { class: "k", text: b.claimed ? "Completed · paid" : `${b.progress}/${b.target} · resets at 00:00 UTC` }) : null,
    )));
  }).catch(() => goals.replaceChildren(h("span", { class: "k", text: "Reward progress unavailable. Reopen the lobby to retry." })));
  return h("section", { class: "rewards-panel" },
    h("div", { class: "row" }, h("h2", { text: `LEVEL ${prog.level}` }), h("span", { class: "grow" }), h("span", { class: "v", text: `${prog.xp.toLocaleString()} lifetime XP` })),
    h("progress", { max: prog.next - prog.floor, value: prog.xp - prog.floor, "aria-label": "Level progress" }),
    h("span", { class: "k", text: `${prog.next - prog.xp} XP to level ${prog.level + 1} · Every awarded coin earns 1 XP. Spending and fines never remove XP.` }),
    h("h3", { text: "BOUNTY BOARD" }),
    h("p", { class: "k", text: `Automatically paid after server-verified online and bot matches. Practice is unrewarded. Every legal multi-pot earns ${MULTIPOT_PER_EXTRA}c per extra ball, on every shot. Win streaks span both modes; losses reset them. Login and daily rack rewards also earn XP.` }),
    goals);
}

const NARRATION_KEY = "cuefield.narration";
let enabled = false;
try { enabled = localStorage.getItem(NARRATION_KEY) === "on"; } catch { /* optional storage */ }
export function narrate(text: string): void {
  if (!enabled || !("speechSynthesis" in window) || document.hidden) return;
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(text);
  speech.rate = 1; speech.volume = 0.7;
  window.speechSynthesis.speak(speech);
}
export function narrationButton(): HTMLButtonElement {
  const button = h("button", { class: "narration-toggle", "aria-pressed": String(enabled), text: `Narration ${enabled ? "on" : "off"}`, onclick: () => {
    enabled = !enabled;
    try { localStorage.setItem(NARRATION_KEY, enabled ? "on" : "off"); } catch { /* optional storage */ }
    button.textContent = `Narration ${enabled ? "on" : "off"}`;
    button.setAttribute("aria-pressed", String(enabled));
    if (!enabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
    else narrate("Table commentary enabled. Good luck at the table.");
  } });
  return button;
}
export function roundText(st: GameState, names: string[]): string {
  const r = st.last;
  if (!r) return "Rack ready. Take your opening shot.";
  const who = names[r.by] || "Player";
  const pots = r.pocketed.filter((id) => id > 0 && !r.respot.includes(id));
  const action = r.foul ? `Foul: ${r.foul.replace(/-/g, " ")}. Ball in hand.` : r.uncalled ? "Uncalled pocket. Turn passes." : pots.length ? `Potted ${pots.join(", ")}.${r.keep ? " Stays at the table." : ""}` : "No pot. Turn passes.";
  const run = st.stats?.[r.by].run ?? 0;
  return `Shot ${st.shot} · ${who}. ${action}${run >= 3 ? ` ${run}-ball run.` : ""}${st.winner >= 0 ? ` ${names[st.winner]} wins the rack.` : ""}`;
}
