import type { Player } from "./auth.ts";
import { one, q } from "./db.ts";
import { PRESENCE_MS } from "./identity.ts";
import { CORR_CLOCK_MS, toMatch } from "./match.ts";
import { tick } from "./turns.ts";

const ONLINE_MS = PRESENCE_MS * 6;
export const INVITE_TTL_MS = 120_000;
export const name = (id: unknown) => `(SELECT name FROM players WHERE id = ${id})`;

/** Players seen recently, flagged busy while seated at a live real-time table. */
export async function online(p: Player) {
  const rows = await q(
    `SELECT id, name, rating, EXISTS(SELECT 1 FROM matches m WHERE m.status = 'live' AND m.clock IS NULL AND (m.p0 = players.id OR m.p1 = players.id)) AS busy
     FROM players WHERE seen > ? AND id != ? ORDER BY seen DESC LIMIT 30`,
    [Date.now() - ONLINE_MS, p.id],
  );
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), rating: Math.round(Number(r.rating)), busy: Number(r.busy) === 1 }));
}

/** Real-time tables with at least one seat still polling, plus correspondence games; newest first. */
export async function liveTables() {
  const now = Date.now();
  const rows = await q(
    `SELECT m.id, m.mode, m.table_id, m.clock, json_extract(m.state, '$.shot') AS shot, ${name("m.p0")} AS a, ${name("m.p1")} AS b,
       (SELECT COUNT(*) FROM watchers w WHERE w.match_id = m.id AND w.seen > ?2) AS watching
     FROM matches m WHERE m.status = 'live' AND (m.clock IS NOT NULL OR m.seen0 > ?1 - 60000 OR m.seen1 > ?1 - 60000)
     ORDER BY m.created DESC LIMIT 20`,
    [now, now - 8000],
  );
  return rows.map((r) => ({
    id: String(r.id),
    mode: Number(r.mode),
    table: String(r.table_id),
    corr: r.clock != null,
    shot: Number(r.shot ?? 0),
    players: [String(r.a), String(r.b)],
    watching: Number(r.watching),
  }));
}

/** Live matches the player sits in (clock applied first, so finished ones drop out) and challenges waiting for them. */
export async function pulse(p: Player) {
  const now = Date.now();
  const rows = await q(`SELECT * FROM matches WHERE status = 'live' AND (p0 = ?1 OR p1 = ?1) ORDER BY created DESC LIMIT 10`, [p.id]);
  const active = [];
  for (const r of rows) {
    const m = await tick(toMatch(r));
    if (m.status !== "live") continue;
    const seat = m.p[0] === p.id ? 0 : 1;
    const opp = await one(`SELECT name FROM players WHERE id = ?`, [m.p[1 - seat]]);
    active.push({ id: m.id, mode: m.mode, table: m.table, corr: m.clock !== null, opponent: String(opp?.name ?? "?"), yourTurn: m.state.turn === seat });
  }
  const inv = await q(
    `SELECT i.*, ${name("i.from_id")} AS from_name FROM invites i
     WHERE i.to_id = ? AND i.status = 'open' AND i.created > (CASE WHEN i.corr = 1 THEN ? ELSE ? END) ORDER BY i.created DESC LIMIT 5`,
    [p.id, now - CORR_CLOCK_MS, now - INVITE_TTL_MS],
  );
  const invites = inv.map((r) => ({
    id: String(r.id),
    from: String(r.from_name),
    mode: Number(r.mode),
    table: String(r.table_id),
    assist: Number(r.assist),
    corr: Number(r.corr) === 1,
  }));
  return { active, invites };
}

/** The player's last finished online matches, for replay links. */
export async function recent(p: Player) {
  const rows = await q(
    `SELECT id, mode, table_id, winner, p0, ${name("CASE WHEN p0 = ?1 THEN p1 ELSE p0 END")} AS opp FROM matches
     WHERE status = 'done' AND init IS NOT NULL AND (p0 = ?1 OR p1 = ?1) ORDER BY ended DESC LIMIT 6`,
    [p.id],
  );
  return rows.map((r) => ({
    id: String(r.id),
    mode: Number(r.mode),
    table: String(r.table_id),
    opponent: String(r.opp),
    won: Number(r.winner) === (r.p0 === p.id ? 0 : 1),
  }));
}
