import { clampAssist, type Mode, tableById } from "../shared/catalog.ts";
import { type Player, randomId } from "./auth.ts";
import { one, q } from "./db.ts";
import { entryError } from "./lobby.ts";
import { CORR_CLOCK_MS, createMatch } from "./match.ts";

const ROOM_TTL_MS = 30 * 60_000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Private room; the host fixes the prediction level both players get (1–4) and whether it is played by correspondence. */
export async function createRoom(p: Player, mode: Mode, table: string, assist: unknown, corr: unknown): Promise<{ code: string } | { error: string }> {
  const err = entryError(p, mode, table);
  if (err) return { error: err };
  await q(`DELETE FROM rooms WHERE created < ? OR (player_id = ? AND match_id IS NULL)`, [Date.now() - ROOM_TTL_MS, p.id]);
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
    const ins = await q(`INSERT OR IGNORE INTO rooms (code, player_id, mode, table_id, assist, corr, created) VALUES (?,?,?,?,?,?,?) RETURNING code`, [
      code,
      p.id,
      mode,
      table,
      clampAssist(assist),
      corr === true ? 1 : 0,
      Date.now(),
    ]);
    if (ins.length) return { code };
  }
  return { error: "busy" };
}

export async function roomStatus(p: Player, code: string): Promise<{ match: string | null } | { error: string }> {
  const r = await one(`SELECT * FROM rooms WHERE code = ?`, [code]);
  if (!r || r.player_id !== p.id) return { error: "room" };
  return { match: r.match_id ? String(r.match_id) : null };
}

/** Host cancelled: an unclaimed room is removed so nobody can join an empty seat later. */
export async function closeRoom(p: Player, code: string): Promise<void> {
  await q(`DELETE FROM rooms WHERE code = ? AND player_id = ? AND match_id IS NULL`, [code, p.id]);
}

export async function joinRoom(p: Player, raw: string): Promise<{ match: string } | { error: string }> {
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const r = await one(`SELECT * FROM rooms WHERE code = ? AND created > ?`, [code, Date.now() - ROOM_TTL_MS]);
  if (!r) return { error: "room" };
  if (r.player_id === p.id) return { error: "self" };
  const spec = tableById(String(r.table_id))!;
  if (p.coins < spec.fee) return { error: "coins" };
  const id = randomId(10);
  const claimed = await q(`UPDATE rooms SET match_id = ? WHERE code = ? AND match_id IS NULL RETURNING code`, [id, code]);
  if (!claimed.length) return { error: "room" };
  const made = await createMatch(String(r.player_id), p.id, Number(r.mode) as Mode, spec.id, false, id, {
    assist: clampAssist(r.assist ?? spec.assist),
    clock: Number(r.corr) === 1 ? CORR_CLOCK_MS : null,
  });
  if (!made) {
    await q(`UPDATE rooms SET match_id = NULL WHERE code = ?`, [code]);
    return { error: "coins" };
  }
  await q(`DELETE FROM queue WHERE player_id IN (?, ?) AND match_id IS NULL`, [r.player_id, p.id]);
  return { match: made };
}
