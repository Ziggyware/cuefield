import { awardList, matchStats, narrate, type Award } from "../ui/rewards.ts";
import { BOT_CUES, botPot, cueById, type CueSpec, type Mode, tableById } from "../../shared/catalog.ts";
import { newGame, PHYSICS_VERSION, type PhysicsVersion } from "../../shared/game/engine.ts";
import type { GameState, StrikeCmd } from "../../shared/game/types.ts";
import { effectiveCue } from "../../shared/upgrades.ts";
import { api, ApiError, type Profile } from "../api.ts";
import type { Level } from "../bot/plan.ts";
import { coins, h, modal, toast } from "../dom.ts";
import { emoteText } from "../../shared/social.ts";
import { prefs } from "../prefs/store.ts";
import { stakeText } from "../ui/hud.ts";
import { mountTable } from "./table-screen.ts";

const BOT_NAME = ["bot · easy", "bot · club", "bot · pro"];

interface SoloStart {
  id: string;
  seed: number;
  breaker: 0 | 1;
  physics?: PhysicsVersion;
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
    srv = await api<SoloStart>("/me/solo", { mode, table, level, physics: PHYSICS_VERSION });
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

  /** Table talk: the house opponent reacts to the run of play, sparingly, from the rail's own vocabulary. */
  let lastTalk = 0;
  const talk = (text: string, chance: number) => {
    if (!prefs.tableTalk || closed) return;
    const now = Date.now();
    if (now - lastTalk < 9000 || Math.random() > chance) return;
    lastTalk = now;
    screen.hud.bubble(1, text);
  };
  const banter = (st: GameState) => {
    const r = st.last;
    if (!r || st.winner >= 0) return;
    const pots = r.pocketed.filter((id) => id > 0 && !r.respot.includes(id)).length;
    if (r.by === 0) {
      if (pots >= 2) talk("wow", 0.8);
      else if (pots === 1 && (st.stats?.[0].run ?? 0) >= 4) talk("run out", 0.7);
      else if (pots === 1) talk("nice shot", 0.35);
      else if (r.foul) talk("rack 'em", 0.55);
      else if (screen.session.shotJaws > 0) talk("that rattled", 0.5);
      else talk("safety battle", 0.3);
    } else if (r.foul) talk("oops", 0.5);
    else if (pots >= 2) talk("on the hill", 0.7);
    else if (r.keep) talk("good leave", 0.4);
  };

  const botTurn = (st: GameState) => {
    if (closed || st.winner >= 0 || st.turn !== 1) return;
    const id = ++req;
    const started = performance.now();
    worker.onmessage = (e: MessageEvent<{ id: number; cmd: StrikeCmd }>) => {
      if (e.data.id !== id || closed) return;
      const present = () => {
        const S = screen.session;
        if (closed || S.sim || S.state.turn !== 1) return;
        if (S.replay) return void setTimeout(present, 150);
        const c = e.data.cmd;
        S.remoteAim = { a: { ...S.aim, angle: Math.atan2(c.dy, c.dx) }, pull: 0.6, place: c.place ?? null };
        setTimeout(() => {
          if (closed || S.sim || S.state.turn !== 1) return;
          if (S.replay) return void setTimeout(present, 150);
          S.play(c);
        }, 450);
      };
      setTimeout(present, Math.max(0, 500 - (performance.now() - started)));
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
    newGame(mode, table, seed, breaker as 0 | 1, srv ? srv.physics ?? 1 : PHYSICS_VERSION),
    cues,
    [{ name: me.name, rating: me.rating }, { name: BOT_NAME[level] }],
    srv ? stakeText(spec.fee, pot) : "offline · unpaid",
    {
      isLocal: (s) => s === 0,
      shoot: () => {},
      settled: (st) => {
        banter(st);
        return st.winner >= 0 ? end(st) : botTurn(st);
      },
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
  setTimeout(() => talk("rack 'em", 0.85), 2600);
}
