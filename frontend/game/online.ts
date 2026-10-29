import { onlinePot, tableById } from "../../shared/catalog.ts";
import { emoteText } from "../../shared/social.ts";
import type { StrikeCmd } from "../../shared/game/types.ts";
import { hash } from "../../shared/game/validate.ts";
import { api, ApiError, type Profile } from "../api.ts";
import { toast } from "../dom.ts";
import { linkTo, share } from "../links.ts";
import { type Head, Peer } from "../net/peer.ts";
import { stakeText } from "../ui/hud.ts";
import { showResult } from "../ui/result.ts";
import type { MatchView } from "./match-view.ts";
import { appHandler, leaveMenu, showHead } from "./online-net.ts";
import { mountTable } from "./table-screen.ts";

export type { MatchView };

/** Server-authoritative online match: peer link for immediacy, server state for truth. */
export async function playOnline(ui: HTMLElement, me: Profile, id: string, exit: (next?: string) => void): Promise<void> {
  const [view, cfg] = await Promise.all([api<MatchView>(`/match/${id}`), api<{ ice: RTCIceServer[] }>("/config")]);
  if (view.seat === -1) throw new ApiError("seat", 403);
  const seat = view.seat, other = (1 - seat) as 0 | 1;
  const spec = tableById(view.table)!;
  let version = view.version, syncing = false, done = false, rejected = false, lastAim = 0;

  const screen = mountTable(
    ui,
    view.state,
    [view.players[0].cue, view.players[1].cue],
    [view.players[0], view.players[1]],
    (view.corr ? "correspondence · " : "") + stakeText(view.stake, view.stake ? onlinePot(spec) : 0),
    {
      isLocal: (s) => s === seat,
      shoot: (cmd) => {
        const shot = screen.session.state.shot;
        peer.send({ t: "shot", shot, cmd });
        api<{ hash: string; version: number }>(`/match/${id}/shot`, { shot, cmd })
          .then((r) => (version = Math.max(version, r.version)))
          .catch(() => {
            rejected = true;
            sync();
          });
      },
      settled: () => sync(),
      aim: (a, pull, place) => {
        const now = performance.now();
        if (now - lastAim < 66) return;
        lastAim = now;
        peer.send({ t: "aim", a, pull, place }, true);
      },
    },
    {
      emote: (e) => {
        screen.hud.bubble(seat, emoteText(e) ?? "");
        peer.send({ t: "emo", e });
      },
      chat: (text) => {
        screen.hud.bubble(seat, text);
        peer.send({ t: "chat", text });
      },
      concede: () => {
        if (done) return finish();
        leaveMenu(view.corr, () => finish(), () => api(`/match/${id}/shot`, { shot: -1, cmd: { k: "concede" } }).finally(() => sync()));
      },
      extra: [{ text: "⇪", fn: () => share(linkTo("watch", id), `${view.players[0].name} vs ${view.players[1].name}`) }],
    },
    { unlocks: me.unlocks, assist: view.assist },
  );
  const S = screen.session;
  S.clockSpan = view.clock;
  S.deadline = view.deadline - (view.now - Date.now());
  const [mine, theirs] = [view.h2h[seat], view.h2h[other]];
  if (mine + theirs > 0) toast(`vs ${view.players[other].name} · head-to-head ${mine}–${theirs}`, 3200);

  const onHead = (hd: Head) => {
    showHead(screen, hd, peer.direct);
    S.deadline = hd.deadline - (hd.now - Date.now());
    if ((hd.version > version || hd.status === "done") && !S.sim && !S.replay) sync();
  };
  const peer = new Peer(id, seat, cfg.ice, appHandler(screen, other), onHead);

  /** Converges the local table on the server: replays the opponent's logged stroke if it is the next one, else snaps. */
  async function sync(): Promise<void> {
    if (syncing || S.sim || S.replay) return;
    syncing = true;
    try {
      const v = await api<MatchView>(`/match/${id}`);
      if (S.sim || S.replay) return;
      version = v.version;
      S.deadline = v.deadline - (v.now - Date.now());
      const lc = v.last?.cmd;
      if (v.state.shot === S.state.shot + 1 && lc?.k === "strike" && v.last!.by !== seat && S.state.winner < 0) S.play(lc as StrikeCmd);
      else if ((rejected || v.state.shot >= S.state.shot) && hash(S.state) !== v.hash) {
        rejected = false;
        if (S.state.shot === v.state.shot) toast("resynced");
        S.setState(v.state);
      }
      if (v.status === "done" && !S.sim && !done) {
        done = true;
        S.setState(v.state);
        showResult(v, seat, finish, (next) => finish(next));
      }
    } catch {
      /* network blip: the next head triggers another sync */
    } finally {
      syncing = false;
    }
  }

  function finish(next?: string) {
    peer.close();
    screen.destroy();
    exit(next);
  }
  sync();
}
