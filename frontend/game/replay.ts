import { MODE_NAME } from "../../shared/catalog.ts";
import { concede, play, timeout } from "../../shared/game/engine.ts";
import type { GameState, StrikeCmd } from "../../shared/game/types.ts";
import { hash } from "../../shared/game/validate.ts";
import { api } from "../api.ts";
import { linkTo, share } from "../links.ts";
import type { ReplayData } from "../net/hub.ts";
import { mountTable } from "./table-screen.ts";

const GAP_MS = 900;

/** Re-derives every intermediate state from the opening rack and the command log with the shared engine. */
function timeline(d: ReplayData): GameState[] {
  const out = [d.init];
  for (const e of d.log) {
    const st = out[out.length - 1];
    if (e.cmd.k === "strike") out.push(play(st, e.cmd as StrikeCmd, d.cues[e.by]).state);
    else if (e.cmd.k === "timeout") out.push(timeout(st));
    else out.push(concede(st, e.by));
  }
  return out;
}

/** Full-match replay from a link: deterministic re-simulation of every stroke, with pause, skip and restart. */
export async function replayMatch(ui: HTMLElement, id: string, exit: () => void): Promise<void> {
  const d = await api<ReplayData>(`/replay/${id}`);
  const states = timeline(d), n = d.log.length;
  let i = 0, paused = false, timer = 0;

  const label = () => {
    const end = i >= n ? (d.winner >= 0 ? ` · ${d.players[d.winner]} wins` : " · no result") : "";
    screen.hud.stake.textContent = `replay ${i}/${n}${paused ? " · paused" : ""}${end}`;
  };
  const schedule = () => {
    clearTimeout(timer);
    label();
    if (!paused && i < n) timer = setTimeout(step, GAP_MS);
  };
  const step = () => {
    if (i >= n || S.sim) return;
    const e = d.log[i];
    if (e.cmd.k === "strike") return S.play(e.cmd as StrikeCmd);
    i++;
    S.setState(states[i]);
    schedule();
  };
  const skip = () => {
    if (i >= n) return;
    i++;
    S.setState(states[i]);
    schedule();
  };

  const screen = mountTable(
    ui,
    states[0],
    d.cues,
    [{ name: d.players[0] }, { name: d.players[1] }],
    "",
    {
      isLocal: () => false,
      shoot: () => {},
      settled: (st) => {
        i++;
        if (hash(st) !== hash(states[i])) S.setState(states[i]);
        schedule();
      },
    },
    {
      emote: () => {},
      chat: () => {},
      noSay: true,
      concede: () => {
        clearTimeout(timer);
        screen.destroy();
        exit();
      },
      extra: [
        { text: "⏯", fn: () => ((paused = !paused), schedule()) },
        { text: "⏭", fn: skip },
        { text: "⏮", fn: () => ((i = 0), S.setState(states[0]), schedule()) },
        { text: "⇪", fn: () => share(linkTo("replay", id), `${d.players[0]} vs ${d.players[1]} · ${MODE_NAME[d.mode]}`) },
      ],
    },
    { assist: 1, highlights: false },
  );
  const S = screen.session;
  S.deadline = 0;
  schedule();
}
