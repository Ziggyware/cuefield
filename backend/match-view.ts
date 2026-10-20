import { tableById } from "../shared/catalog.ts";
import { hash } from "../shared/game/validate.ts";
import { one, q } from "./db.ts";
import { clockOf, type Match } from "./match.ts";

const WATCH_WINDOW_MS = 8_000;

/** Spectators that polled within the window. */
export async function watcherCount(id: string): Promise<number> {
  const r = await one(`SELECT COUNT(*) AS n FROM watchers WHERE match_id = ? AND seen > ?`, [id, Date.now() - WATCH_WINDOW_MS]);
  return Number(r?.n ?? 0);
}

/** Cheers after the cursor, oldest first. A negative cursor returns only the newest, to seed it without history. */
export async function cheersAfter(id: string, after: number): Promise<{ id: number; kind: number }[]> {
  const rows = after < 0
    ? await q(`SELECT id, kind FROM cheers WHERE match_id = ? ORDER BY id DESC LIMIT 1`, [id])
    : await q(`SELECT id, kind FROM cheers WHERE match_id = ? AND id > ? ORDER BY id LIMIT 20`, [id, after]);
  return rows.map((r) => ({ id: Number(r.id), kind: Number(r.kind) }));
}

/** Finished decisive games between the two players: [wins of a, wins of b]. */
export async function headToHead(a: string, b: string): Promise<[number, number]> {
  const r = await one(
    `SELECT
       SUM(CASE WHEN (p0 = ?1 AND winner = 0) OR (p1 = ?1 AND winner = 1) THEN 1 ELSE 0 END) AS a,
       SUM(CASE WHEN (p0 = ?2 AND winner = 0) OR (p1 = ?2 AND winner = 1) THEN 1 ELSE 0 END) AS b
     FROM matches WHERE status = 'done' AND winner >= 0 AND ((p0 = ?1 AND p1 = ?2) OR (p0 = ?2 AND p1 = ?1))`,
    [a, b],
  );
  return [Number(r?.a ?? 0), Number(r?.b ?? 0)];
}

export async function matchView(m: Match, seat: 0 | 1 | -1) {
  const [names, h2h, watching] = await Promise.all([
    q(`SELECT id, name, rating FROM players WHERE id IN (?, ?)`, [m.p[0], m.p[1]]),
    headToHead(m.p[0], m.p[1]),
    watcherCount(m.id),
  ]);
  const info = (i: 0 | 1) => {
    const r = names.find((n) => n.id === m.p[i]);
    return { id: m.p[i], name: r ? String(r.name) : "?", rating: r ? Math.round(Number(r.rating)) : 0, cue: m.cue[i] };
  };
  return {
    id: m.id,
    mode: m.mode,
    table: m.table,
    stake: m.stake,
    ranked: m.ranked,
    assist: m.assist ?? tableById(m.table)!.assist,
    clock: clockOf(m),
    corr: m.clock !== null,
    players: [info(0), info(1)],
    seat,
    state: m.state,
    hash: hash(m.state),
    version: m.version,
    deadline: m.deadline,
    now: Date.now(),
    status: m.status,
    winner: m.winner,
    reason: m.reason,
    rematch: m.rematch,
    next: m.next,
    h2h,
    watching,
    last: m.log.length ? m.log[m.log.length - 1] : null,
  };
}
