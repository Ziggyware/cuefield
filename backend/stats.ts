import { TABLES } from "../shared/catalog.ts";
import type { Player } from "./auth.ts";
import { one, q } from "./db.ts";
import { result, RESULTS } from "./results.ts";

const DAY = 86_400_000;
let cache: { at: number; body: unknown } | null = null;

/** Site-wide numbers for the main screen, recomputed at most every 15 s. */
export async function globalStats() {
  const now = Date.now();
  if (cache && now - cache.at < 15_000) return cache.body;
  const since = now - DAY;
  const [players, live, queued, today, venues, top, streak, recent] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM players`),
    one(`SELECT COUNT(*) AS n FROM matches WHERE status = 'live' AND MAX(seen0, seen1) > ?`, [now - 60_000]),
    one(`SELECT COUNT(*) AS n FROM queue WHERE seen > ? AND match_id IS NULL`, [now - 15_000]),
    one(
      `SELECT (SELECT COUNT(*) FROM matches WHERE status = 'done' AND ended > ?1) AS online,
              (SELECT COUNT(*) FROM solo WHERE done = 1 AND won >= 0 AND ended > ?1) AS bot,
              (SELECT COALESCE(SUM(stake * 2), 0) FROM matches WHERE status = 'done' AND winner >= 0 AND ended > ?1)
            + (SELECT COALESCE(SUM(pot), 0) FROM solo WHERE done = 1 AND ended > ?1) AS paid`,
      [since],
    ),
    q(
      `SELECT table_id, COUNT(*) AS plays, SUM(pot) AS paid FROM (
         SELECT table_id, stake * 2 AS pot FROM matches WHERE status = 'done' AND winner >= 0
         UNION ALL SELECT table_id, pot FROM solo WHERE done = 1 AND won >= 0) GROUP BY table_id`,
    ),
    q(`SELECT name, rating, wins, losses FROM players WHERE wins + losses > 0 ORDER BY rating DESC LIMIT 5`),
    one(`SELECT name, best_streak FROM players ORDER BY best_streak DESC LIMIT 1`),
    q(RESULTS, [null, 12]),
  ]);
  const body = {
    players: Number(players?.n ?? 0),
    live: Number(live?.n ?? 0),
    queued: Number(queued?.n ?? 0),
    today: { online: Number(today?.online ?? 0), bot: Number(today?.bot ?? 0), paid: Number(today?.paid ?? 0) },
    venues: TABLES.map((t) => {
      const v = venues.find((r) => r.table_id === t.id);
      return { id: t.id, plays: Number(v?.plays ?? 0), paid: Number(v?.paid ?? 0) };
    }),
    top: top.map((r) => ({ name: String(r.name), rating: Math.round(Number(r.rating)), wins: Number(r.wins), losses: Number(r.losses) })),
    streak: streak && Number(streak.best_streak) > 0 ? { name: String(streak.name), n: Number(streak.best_streak) } : null,
    recent: recent.map((r) => result(r)),
  };
  cache = { at: now, body };
  return body;
}

/** Competitive record for one player: rank among rated players, per-venue record and their recent results. */
export async function playerStats(p: Player) {
  const [rank, rated, venues, recent] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM players WHERE wins + losses > 0 AND rating > ?`, [p.rating]),
    one(`SELECT COUNT(*) AS n FROM players WHERE wins + losses > 0`),
    q(
      `SELECT table_id, SUM(w) AS w, SUM(l) AS l FROM (
         SELECT table_id, CASE WHEN (winner = 0 AND p0 = ?1) OR (winner = 1 AND p1 = ?1) THEN 1 ELSE 0 END AS w,
                CASE WHEN (winner = 0 AND p0 = ?1) OR (winner = 1 AND p1 = ?1) THEN 0 ELSE 1 END AS l
         FROM matches WHERE status = 'done' AND winner >= 0 AND (p0 = ?1 OR p1 = ?1)
         UNION ALL SELECT table_id, won, 1 - won FROM solo WHERE player_id = ?1 AND done = 1 AND won >= 0) GROUP BY table_id`,
      [p.id],
    ),
    q(RESULTS, [p.id, 20]),
  ]);
  const games = p.wins + p.losses;
  return {
    rank: games ? Number(rank?.n ?? 0) + 1 : null,
    of: Number(rated?.n ?? 0),
    winPct: games ? p.wins / games : null,
    venues: TABLES.map((t) => {
      const v = venues.find((r) => r.table_id === t.id);
      return { id: t.id, w: Number(v?.w ?? 0), l: Number(v?.l ?? 0) };
    }),
    recent: recent.map((r) => result(r, p.id)),
  };
}
