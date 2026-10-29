import { tableById } from "../../shared/catalog.ts";
import { DAILY, dailyRack, soloNext } from "../../shared/game/daily.ts";
import { api, ApiError, type Profile } from "../api.ts";
import { coins, h, modal } from "../dom.ts";
import type { DailyInfo } from "../net/hub.ts";
import { mountTable, type TableScreen } from "./table-screen.ts";

interface Finish {
  score: number;
  strokes: number;
  fouls: number;
  best: number;
  rank: number;
  reward: number;
  profile: Profile;
}

/**
 * Daily Rack: the same deterministic 9-ball rack for every player today. Every stroke is yours; a foul costs one
 * point and gives ball in hand. Score = strokes + fouls to win the rack; the server re-simulates the run.
 */
export async function playDaily(ui: HTMLElement, me: Profile, exit: (p?: Profile) => void): Promise<void> {
  const info = await api<DailyInfo>("/daily");
  const assist = tableById(info.table)!.assist;
  let screen: TableScreen, fouls = 0, latest: Profile | undefined;

  const label = () => (screen.hud.stake.textContent = `daily rack · ${screen.session.log.length} strokes · ${fouls} fouls`);
  const leave = () => (screen.destroy(), exit(latest));
  const restart = () => (screen.destroy(), start());
  const outro = (title: string, note: HTMLElement) => {
    const m = modal(
      h("div", { class: "big", text: title }),
      note,
      h(
        "div",
        { class: "row" },
        h("button", { class: "primary", text: "again", onclick: () => (m.close(), restart()) }),
        h("button", { text: "lobby", "data-esc": true, onclick: () => (m.close(), leave()) }),
      ),
    );
  };

  const submit = async () => {
    const note = h("span", { class: "k", text: "verifying run" });
    outro("rack cleared", note);
    try {
      const r = await api<Finish>("/daily/finish", { day: info.day, log: screen.session.log });
      latest = r.profile;
      note.className = "v";
      note.textContent = `score ${r.score} (${r.strokes} strokes + ${r.fouls} fouls) · best ${r.best} · rank #${r.rank}` +
        (r.reward ? ` · +${coins(r.reward)}` : "");
    } catch (e) {
      note.className = "bad";
      note.textContent = e instanceof ApiError && e.code === "day" ? "the day rolled over: start today's rack" : "run could not be verified";
    }
  };

  function start() {
    fouls = 0;
    screen = mountTable(
      ui,
      dailyRack(info.day, info.physics ?? 1),
      [info.cue, info.cue],
      [{ name: me.name }, { name: "" }],
      "",
      {
        isLocal: () => true,
        shoot: () => {},
        settled: (st) => {
          if (st.last?.foul) fouls++;
          label();
          if (st.winner === 0) return void submit();
          if (st.winner === 1 || screen.session.log.length >= DAILY.maxStrokes) {
            return outro("rack lost", h("span", { class: "k", text: `limit is ${DAILY.maxStrokes} strokes` }));
          }
          screen.session.setState(soloNext(st));
        },
      },
      { emote: () => {}, chat: () => {}, noSay: true, concede: leave, extra: [{ text: "restart", fn: restart }] },
      { assist, unlocks: me.unlocks },
    );
    label();
  }
  start();
}
