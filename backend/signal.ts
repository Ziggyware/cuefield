import { q } from "./db.ts";
import type { Match } from "./match.ts";

const MAX_BODY = 16_384;
const TTL_MS = 5 * 60_000;

/** Mailbox for WebRTC offer/answer/ICE and for relayed traffic when no peer path exists. */
export async function send(m: Match, from: 0 | 1, body: unknown): Promise<{ id: number } | { error: string }> {
  const s = JSON.stringify(body);
  if (s.length > MAX_BODY) return { error: "size" };
  const r = await q(`INSERT INTO mailbox (match_id, to_idx, body, created) VALUES (?,?,?,?) RETURNING id`, [m.id, 1 - from, s, Date.now()]);
  return { id: Number(r[0].id) };
}

/** Returns messages after the cursor and acknowledges (deletes) everything up to it. */
export async function receive(m: Match, seat: 0 | 1, after: number): Promise<{ id: number; body: unknown }[]> {
  if (after > 0) await q(`DELETE FROM mailbox WHERE match_id = ? AND to_idx = ? AND id <= ?`, [m.id, seat, after]);
  await q(`DELETE FROM mailbox WHERE created < ?`, [Date.now() - TTL_MS]);
  const rows = await q(`SELECT id, body FROM mailbox WHERE match_id = ? AND to_idx = ? AND id > ? ORDER BY id LIMIT 200`, [m.id, seat, after]);
  return rows.map((r) => ({ id: Number(r.id), body: JSON.parse(String(r.body)) }));
}
