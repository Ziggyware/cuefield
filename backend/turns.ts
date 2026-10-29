import { concede, play, timeout } from "../shared/game/engine.ts";
import { highlightOf } from "../shared/game/highlights.ts";
import type { Cmd, GameState } from "../shared/game/types.ts";
import { hash, validate } from "../shared/game/validate.ts";
import { q, transaction } from "./db.ts";
import { clockOf, createMatch, loadMatch, type Match } from "./match.ts";
import { payout } from "./payout.ts";

export const STALE_MS = 45_000;
const ANIM_GRACE_MS = 8_000;
/** Both clients can watch a highlight and its two safety pauses without losing shot-clock time. */
const HIGHLIGHT_GRACE_MS = 8_000;

async function commit(m: Match, state: GameState, entry: unknown, deadline: number, reason: string | null, finePlayer?: string): Promise<boolean> {
  return transaction(async () => {
    const done = state.winner >= 0;
    const rows = await q(
      `UPDATE matches SET state = ?, log = ?, version = version + 1, deadline = ?, status = ?, winner = ?, reason = ?, ended = ?
       WHERE id = ? AND version = ? AND status = 'live' RETURNING id`,
      [
        JSON.stringify(state),
        JSON.stringify([...m.log, entry]),
        deadline,
        done ? "done" : "live",
        state.winner,
        done ? reason : null,
        done ? Date.now() : null,
        m.id,
        m.version,
      ],
    );
    if (!rows.length) return false;
    if (done) await payout({ ...m, state }, state.winner as 0 | 1);
    if (finePlayer) await q(`UPDATE players SET coins = MAX(0, coins - 5) WHERE id = ?`, [finePlayer]);
    return true;
  });
}

export type ShotResult = { ok: true; hash: string; version: number } | { error: string; status?: number };

export async function submit(m: Match, seat: 0 | 1, cmd: Cmd, shot: number): Promise<ShotResult> {
  if (m.status !== "live") return { error: "over", status: 409 };
  if (!cmd || typeof cmd !== "object" || typeof cmd.k !== "string") return { error: "cmd", status: 400 };
  const st = m.state;
  if (cmd.k === "concede") {
    const next = concede(st, seat);
    return (await commit(m, next, { by: seat, cmd }, m.deadline, "concede"))
      ? { ok: true, hash: hash(next), version: m.version + 1 }
      : { error: "race", status: 409 };
  }
  if (st.turn !== seat) return { error: "turn", status: 409 };
  if (st.shot !== shot) return { error: "seq", status: 409 };
  if (cmd.k !== "strike") return { error: "cmd", status: 400 };
  const cue = m.cue[seat];
  const err = validate(st, cmd, cue);
  if (err) return { error: err, status: 400 };

  const { state, sim } = play(st, cmd, cue);

  const deadline = Date.now() + Math.ceil(sim.t * 1000) + clockOf(m) + ANIM_GRACE_MS + (highlightOf(sim.events, state) ? HIGHLIGHT_GRACE_MS : 0);
  const finePlayer = state.last?.foul && m.stake > 0 ? m.p[seat] : undefined;
  if (!await commit(m, state, { by: seat, cmd }, deadline, "win", finePlayer)) return { error: "race", status: 409 };
  return { ok: true, hash: hash(state), version: m.version + 1 };
}

async function abandon(m: Match): Promise<void> {
  await transaction(async () => {
    const rows = await q(
      `UPDATE matches SET status = 'done', winner = -1, reason = 'abandoned', ended = ?, version = version + 1 WHERE id = ? AND version = ? AND status = 'live' RETURNING id`,
      [Date.now(), m.id, m.version],
    );
    if (rows.length && m.stake > 0) await q(`UPDATE players SET coins = coins + ? WHERE id IN (?, ?)`, [m.stake, m.p[0], m.p[1]]);
  });
}

export async function tick(m: Match, now = Date.now()): Promise<Match> {
  if (m.status !== "live") return m;
  const stale = m.clock === null ? ([0, 1] as const).filter((s) => now - m.seen[s] > STALE_MS) : [];
  if (stale.length === 2) {
    await abandon(m);
    return (await loadMatch(m.id)) ?? m;
  }
  if (stale.length === 1) {
    const s = stale[0];
    await commit(m, concede(m.state, s), { by: s, cmd: { k: "forfeit" } }, m.deadline, "forfeit");
    return (await loadMatch(m.id)) ?? m;
  }
  if (now > m.deadline) {
    const next = timeout(m.state);
    const finePlayer = m.stake > 0 ? m.p[m.state.turn] : undefined;
    await commit(m, next, { by: m.state.turn, cmd: { k: "timeout" } }, now + clockOf(m) + ANIM_GRACE_MS, "timeouts", finePlayer);
    return (await loadMatch(m.id)) ?? m;
  }
  return m;
}

export async function heartbeat(m: Match, seat: 0 | 1): Promise<void> {
  m.seen[seat] = Date.now();
  await q(`UPDATE matches SET seen${seat} = ? WHERE id = ?`, [m.seen[seat], m.id]);
}

export async function rematch(m: Match, seat: 0 | 1): Promise<string | null> {
  if (m.status !== "done") return null;
  if (m.next) return m.next;
  return transaction(async () => {
    await q(`UPDATE matches SET rematch${seat} = 1 WHERE id = ?`, [m.id]);
    const fresh = await loadMatch(m.id);
    if (!fresh || !fresh.rematch[0] || !fresh.rematch[1] || fresh.next) return fresh?.next ?? null;
    const claim = await q(`UPDATE matches SET next_id = 'pending' WHERE id = ? AND next_id IS NULL RETURNING id`, [m.id]);
    if (!claim.length) return null;
    const id = await createMatch(m.p[1], m.p[0], m.mode, m.table, m.ranked, undefined, { assist: m.assist, clock: m.clock });
    await q(`UPDATE matches SET next_id = ? WHERE id = ?`, [id ?? "none", m.id]);
    return id;
  });
}
