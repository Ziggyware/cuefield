import { clampAssist, isMode, type Mode, tableById } from "../shared/catalog.ts";
import { type Player, randomId } from "./auth.ts";
import { one, q } from "./db.ts";
import { INVITE_TTL_MS } from "./hub.ts";
import { entryError } from "./lobby.ts";
import { CORR_CLOCK_MS, createMatch } from "./match.ts";

/** Direct challenge to an online player: venue, mode, prediction and real-time or correspondence. */
export async function challenge(p: Player, b: Record<string, unknown>): Promise<{ id: string } | { error: string }> {
  const err = entryError(p, b.mode, b.table);
  if (err) return { error: err };
  const to = await one(`SELECT id FROM players WHERE id = ?`, [b.to]);
  if (!to || to.id === p.id) return { error: "player" };
  await q(`UPDATE invites SET status = 'cancelled' WHERE from_id = ? AND to_id = ? AND status = 'open'`, [p.id, to.id]);
  const id = randomId(6);
  await q(`INSERT INTO invites (id, from_id, to_id, mode, table_id, assist, corr, created) VALUES (?,?,?,?,?,?,?,?)`, [
    id,
    p.id,
    to.id,
    b.mode,
    b.table,
    clampAssist(b.assist ?? tableById(String(b.table))!.assist),
    b.corr === true ? 1 : 0,
    Date.now(),
  ]);
  return { id };
}

/** Challenger polls this; cancel withdraws an unanswered invite. */
export async function inviteStatus(p: Player, id: string, cancel = false) {
  if (cancel) await q(`UPDATE invites SET status = 'cancelled' WHERE id = ? AND from_id = ? AND status = 'open'`, [id, p.id]);
  const r = await one(`SELECT status, match_id, created, corr FROM invites WHERE id = ? AND from_id = ?`, [id, p.id]);
  if (!r) return { error: "invite" };
  const expired = r.status === "open" && Number(r.created) < Date.now() - (Number(r.corr) === 1 ? CORR_CLOCK_MS : INVITE_TTL_MS);
  return { status: expired ? "expired" : String(r.status), match: r.match_id == null ? null : String(r.match_id) };
}

/** Accepting escrows both fees and opens the match; a short challenger simply fails the accept. */
export async function answer(p: Player, id: string, accept: boolean): Promise<{ match: string | null } | { error: string }> {
  const claim = await q(`UPDATE invites SET status = ? WHERE id = ? AND to_id = ? AND status = 'open' RETURNING *`, [
    accept ? "accepted" : "declined",
    id,
    p.id,
  ]);
  const r = claim[0];
  if (!r) return { error: "invite" };
  if (!accept) return { match: null };
  const corr = Number(r.corr) === 1, mode = Number(r.mode);
  if (!isMode(mode) || p.coins < (tableById(String(r.table_id))?.fee ?? Infinity)) return fault(id, "coins");
  const made = await createMatch(String(r.from_id), p.id, mode as Mode, String(r.table_id), false, undefined, {
    assist: clampAssist(r.assist),
    clock: corr ? CORR_CLOCK_MS : null,
  });
  if (!made) return fault(id, "coins");
  await q(`UPDATE invites SET match_id = ? WHERE id = ?`, [made, id]);
  return { match: made };
}

async function fault(id: string, error: string) {
  await q(`UPDATE invites SET status = 'failed' WHERE id = ?`, [id]);
  return { error };
}
