import type { Row } from "./db.ts";

const LEVELS = ["easy", "club", "pro"];

/** Finished online and bot matches as one stream; ? binds a player id filter (or NULL for everyone) and a limit. */
export const RESULTS = `
  SELECT 'online' AS kind, m.mode, m.table_id, m.ended, m.reason, m.stake * 2 AS pot, -1 AS level,
    CASE WHEN m.winner = 0 THEN m.p0 ELSE m.p1 END AS wid, CASE WHEN m.winner = 0 THEN a.name ELSE b.name END AS wname,
    CASE WHEN m.winner = 0 THEN m.p1 ELSE m.p0 END AS lid, CASE WHEN m.winner = 0 THEN b.name ELSE a.name END AS lname
  FROM matches m JOIN players a ON a.id = m.p0 JOIN players b ON b.id = m.p1
  WHERE m.status = 'done' AND m.winner >= 0 AND (?1 IS NULL OR m.p0 = ?1 OR m.p1 = ?1)
  UNION ALL
  SELECT 'bot', s.mode, s.table_id, s.ended, NULL, s.pot, s.level,
    CASE WHEN s.won = 1 THEN s.player_id ELSE '' END, CASE WHEN s.won = 1 THEN p.name ELSE '' END,
    CASE WHEN s.won = 1 THEN '' ELSE s.player_id END, CASE WHEN s.won = 1 THEN '' ELSE p.name END
  FROM solo s JOIN players p ON p.id = s.player_id
  WHERE s.done = 1 AND s.won >= 0 AND (?1 IS NULL OR s.player_id = ?1)
  ORDER BY ended DESC LIMIT ?2`;

export function result(r: Row, me?: string) {
  const bot = r.kind === "bot" ? `bot · ${LEVELS[Number(r.level)] ?? "?"}` : "";
  return {
    kind: String(r.kind),
    mode: Number(r.mode),
    table: String(r.table_id),
    ended: Number(r.ended),
    reason: r.reason == null ? null : String(r.reason),
    pot: Number(r.pot),
    winner: String(r.wname) || bot,
    loser: String(r.lname) || bot,
    won: me === undefined ? undefined : r.wid === me,
  };
}
