import { awardList, matchStats, narrate, type Award } from "../ui/rewards.ts";
import { BOT_CUES, botPot, cueById, type CueSpec, type Mode, tableById } from "../../shared/catalog.ts";
import { newGame } from "../../shared/game/engine.ts";
import type { GameState, StrikeCmd } from "../../shared/game/types.ts";
import { effectiveCue } from "../../shared/upgrades.ts";
import { api, ApiError, type Profile } from "../api.ts";
import type { Level } from "../bot/plan.ts";
import { coins, h, modal, toast } from "../dom.ts";
import { emoteText } from "../../shared/social.ts";
import { stakeText } from "../ui/hud.ts";
import { mountTable } from "./table-screen.ts";

const BOT_NAME = ["bot · easy", "bot · club", "bot · pro"];

interface SoloStart {
  id: string;
  seed: number;
  breaker: 0 | 1;
  cue: CueSpec;
}

/**
 * Match against the planner in a worker. The venue fee is paid when the match opens; the server fixes the rack and
 * replays the log to pay a verified win. Without a connection the match is unpaid and unrewarded.
 */
export async function playBot(ui: HTMLElement, me: Profile, mode: Mode, table: string, level: Level, exit: () => void): Promise<void> {
  const spec = tableById(table)!, pot = botPot(spec, level);
  let srv: SoloStart | null = null;
  try {
    srv = await api<SoloStart>("/me/solo", { mode, table, level });
  } catch (e) {
    if (e instanceof ApiError) {
      toast(e.code === "coins" ? `entry is ${coins(spec.fee)}` : e.code);
      return exit();
    }
  }
  const seed = srv?.seed ?? (Math.random() * 2 ** 31) >>> 0;
  const breaker = srv?.breaker ?? (Math.random() < 0.5 ? 0 : 1);
  const cues: [CueSpec, CueSpec] = [srv?.cue ?? effectiveCue(cueById(me.cue), me.upgrades), cueById(BOT_CUES[level])];
  const worker = new Worker(new URL("../bot/worker.ts", import.meta.url), { type: "module" });
  let req = 0, closed = false;

  const botTurn = (st: GameState) => {
    if (closed || st.winner >= 0 || st.turn !== 1) return;
    const id = ++req;
    const started = performance.now();
    worker.onmessage = (e: MessageEvent<{ id: number; cmd: StrikeCmd }>) => {
      if (e.data.id !== id || closed) return;
      setTimeout(() => {
        const S = screen.session;
        if (closed || S.sim || S.state.turn !== 1) return;
        const c = e.data.cmd;
        S.remoteAim = { a: { ...S.aim, angle: Math.atan2(c.dy, c.dx) }, pull: 0.6, place: c.place ?? null };
        setTimeout(() => !closed && S.play(e.data.cmd), 450);
      }, Math.max(0, 900 - (performance.now() - started)));
    };
    worker.postMessage({ id, state: st, cue: cues[1], level, seed: (seed + st.shot * 7919) >>> 0 });
  };

  const end = async (st: GameState) => {
    const won = st.winner === 0;
    narrate(`${won ? me.name : BOT_NAME[level]} wins the rack. Match highlights are ready.`);
    const awards = h("div");
    const note = h("span", { class: "k", text: srv ? "verifying" : "offline · no reward" });
    const m = modal(
      h("div", { class: "big", text: won ? "won" : "lost" }),
      note,
      matchStats(st, [me.name, BOT_NAME[level]]),
      awards,
      h(
        "div",
        { class: "row" },
        h("button", { class: "primary", text: "again", onclick: () => (m.close(), close(), playBot(ui, me, mode, table, level, exit)) }),
        h("button", { text: "lobby", onclick: () => (m.close(), close(), exit()) }),
      ),
    );
    if (!srv) return;
    try {
      const r = await api<{ won: boolean; reward: number; bonuses: Award[]; capped?: boolean }>("/me/solo/finish", { id: srv.id, log: screen.session.log });
      note.textContent = r.won ? `+${coins(r.reward)}${r.capped ? " · daily house limit reached" : ""}` : spec.fee ? `−${coins(spec.fee)}` : "no entry fee";
      awards.replaceChildren(awardList(r.bonuses));
      note.className = r.won ? "v" : "bad";
    } catch {
      note.textContent = "not verified";
    }
  };

  const screen = mountTable(
    ui,
    newGame(mode, table, seed, breaker as 0 | 1),
    cues,
    [{ name: me.name, rating: me.rating }, { name: BOT_NAME[level] }],
    srv ? stakeText(spec.fee, pot) : "offline · unpaid",
    {
      isLocal: (s) => s === 0,
      shoot: () => {},
      settled: (st) => (st.winner >= 0 ? end(st) : botTurn(st)),
    },
    {
      emote: (k) => screen.hud.bubble(0, emoteText(k) ?? ""),
      chat: (t) => screen.hud.bubble(0, t),
      concede: () => {
        if (srv && spec.fee && !confirm(`Leave? The ${coins(spec.fee)} entry is kept by the house.`)) return;
        close();
        exit();
      },
    },
    { assist: spec.assist, unlocks: me.unlocks },
  );

  function close() {
    closed = true;
    worker.terminate();
    screen.destroy();
  }
  botTurn(screen.session.state);
}
