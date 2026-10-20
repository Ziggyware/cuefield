import { isMode, type Mode, tableById } from "../shared/catalog.ts";
import { type Player, randomId } from "./auth.ts";
import { one, q } from "./db.ts";
import { createMatch } from "./match.ts";

const QUEUE_STALE_MS = 15_000;

export function entryError(p: Player, mode: unknown, table: unknown): string | null {
  if (!isMode(mode)) return "mode";
  const spec = typeof table === "string" ? tableById(table) : undefined;
  if (!spec) return "table";
  if (p.coins < spec.fee) return "coins";
  return null;
}

/** Rating window widens with the longer wait: 150 + 15·s Elo. */
const window = (waitMs: number) => 150 + 15 * (waitMs / 1000);

export async function joinQueue(p: Player, mode: Mode, table: string): Promise<{ match: string | null } | { error: string }> {
  const err = entryError(p, mode, table);
  if (err) return { error: err };
  const now = Date.now();
  await q(`DELETE FROM queue WHERE seen < ?`, [now - QUEUE_STALE_MS]);
  await q(`DELETE FROM queue WHERE player_id = ?`, [p.id]);
  const cands = await q(
    `SELECT player_id, rating, joined FROM queue WHERE mode = ? AND table_id = ? AND match_id IS NULL AND player_id != ? ORDER BY joined LIMIT 20`,
    [mode, table, p.id],
  );
  for (const c of cands) {
    if (Math.abs(Number(c.rating) - p.rating) > window(now - Number(c.joined))) continue;
    const id = randomId(10);
    const claimed = await q(`UPDATE queue SET match_id = ? WHERE player_id = ? AND match_id IS NULL RETURNING player_id`, [id, c.player_id]);
    if (!claimed.length) continue;
    const made = await createMatch(String(c.player_id), p.id, mode, table, true, id);
    if (made) return { match: made };
    await q(`DELETE FROM queue WHERE player_id = ? AND match_id = ?`, [c.player_id, id]);
  }
  await q(`INSERT INTO queue (player_id, mode, table_id, rating, joined, seen) VALUES (?,?,?,?,?,?)`, [p.id, mode, table, p.rating, now, now]);
  return { match: null };
}

export async function pollQueue(p: Player): Promise<{ match: string | null; queued: boolean }> {
  const r = await one(`SELECT match_id FROM queue WHERE player_id = ?`, [p.id]);
  if (!r) return { match: null, queued: false };
  if (r.match_id) {
    await q(`DELETE FROM queue WHERE player_id = ?`, [p.id]);
    return { match: String(r.match_id), queued: false };
  }
  await q(`UPDATE queue SET seen = ? WHERE player_id = ?`, [Date.now(), p.id]);
  return { match: null, queued: true };
}

export async function leaveQueue(p: Player): Promise<void> {
  await q(`DELETE FROM queue WHERE player_id = ? AND match_id IS NULL`, [p.id]);
}
