import type { Context, Next } from "npm:hono@4";
import { getOAuthUserData } from "https://esm.town/v/std/oauth/middleware.ts";
import { cleanName, createGuest, type Player, sha256, toPlayer } from "./auth.ts";
import { migrate, one, q } from "./db.ts";

export type Env = { Variables: { player: Player } };

/** Presence is refreshed at most this often; "online" means seen within a few of these. */
export const PRESENCE_MS = 15_000;

const bearer = (c: Context) => {
  const h = c.req.header("authorization") ?? "";
  const t = h.startsWith("Bearer ") ? h.slice(7) : "";
  return t.length === 64 ? t : null;
};

/** Val Town session user, if the request carries one. */
export async function vtUser(c: Context): Promise<{ id: string; name: string } | null> {
  const s = await getOAuthUserData(c.req.raw).catch(() => null);
  if (!s?.user) return null;
  return { id: s.user.id, name: cleanName(s.user.username ?? "") ?? `vt-${s.user.id.slice(0, 6)}` };
}

/**
 * Identity: a Val Town login owns its player row (name = Val Town username). The first time a login is seen, the
 * guest account on this device (bearer token) is bound to it so its coins and unlocks carry over; otherwise a new
 * row is made. Without a login, a guest bearer token still authenticates.
 */
export async function requireAuth(c: Context<Env>, next: Next) {
  await migrate();
  const vt = await vtUser(c);
  const tok = bearer(c);
  let r = vt ? await one(`SELECT * FROM players WHERE vt_id = ?`, [vt.id]) : undefined;
  if (vt && !r && tok) {
    r = (await q(`UPDATE players SET vt_id = ?, name = ? WHERE token_hash = ? AND vt_id IS NULL RETURNING *`, [vt.id, vt.name, await sha256(tok)]))[0];
  }
  if (vt && !r) {
    const g = await createGuest(vt.name);
    try {
      r = (await q(`UPDATE players SET vt_id = ? WHERE id = ? RETURNING *`, [vt.id, g.id]))[0];
    } catch {
      // A parallel first request bound this login already (unique vt_id): use that row, drop the spare.
      await q(`DELETE FROM players WHERE id = ?`, [g.id]);
      r = await one(`SELECT * FROM players WHERE vt_id = ?`, [vt.id]);
    }
  }
  if (vt && r && r.name !== vt.name) r = (await q(`UPDATE players SET name = ? WHERE id = ? RETURNING *`, [vt.name, r.id]))[0];
  if (!r && tok) r = await one(`SELECT * FROM players WHERE token_hash = ?`, [await sha256(tok)]);
  if (!r) return c.json({ error: "auth" }, 401);
  const now = Date.now();
  if (now - Number(r.seen ?? 0) > PRESENCE_MS) await q(`UPDATE players SET seen = ? WHERE id = ?`, [now, r.id]);
  c.set("player", toPlayer(r));
  await next();
}
