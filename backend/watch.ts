import { CHEERS } from "../shared/social.ts";
import { one, q } from "./db.ts";
import { cheersAfter, matchView } from "./match-view.ts";
import { loadMatch, toMatch } from "./match.ts";
import { tick } from "./turns.ts";

const CHEER_GAP_MS = 2_500;
/** Anonymous per-tab spectator id from the client. */
export const viewerOk = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{16,32}$/.test(v);

/** Spectator poll: registers presence, advances the clock, returns the public view and new cheers. */
export async function watch(id: string, viewer: unknown, after: number) {
  const m = await loadMatch(id);
  if (!m) return null;
  const now = Date.now();
  if (viewerOk(viewer) && m.status === "live") {
    await q(`INSERT INTO watchers (match_id, viewer, seen) VALUES (?,?,?) ON CONFLICT(match_id, viewer) DO UPDATE SET seen = excluded.seen`, [id, viewer, now]);
    if (Math.random() < 0.05) await q(`DELETE FROM watchers WHERE seen < ?`, [now - 600_000]);
  }
  return { ...(await matchView(await tick(m), -1)), cheers: await cheersAfter(id, after) };
}

/** One reaction per viewer per gap, only on live tables. */
export async function cheer(id: string, viewer: unknown, kind: unknown): Promise<{ ok: true } | { error: string }> {
  if (!viewerOk(viewer)) return { error: "viewer" };
  if (typeof kind !== "number" || !Number.isInteger(kind) || kind < 0 || kind >= CHEERS.length) return { error: "kind" };
  const m = await one(`SELECT status FROM matches WHERE id = ?`, [id]);
  if (!m || m.status !== "live") return { error: "match" };
  const now = Date.now();
  const recent = await one(`SELECT 1 AS x FROM cheers WHERE match_id = ? AND viewer = ? AND created > ?`, [id, viewer, now - CHEER_GAP_MS]);
  if (recent) return { error: "slow" };
  await q(`INSERT INTO cheers (match_id, viewer, kind, created) VALUES (?,?,?,?)`, [id, viewer, kind, now]);
  if (Math.random() < 0.05) await q(`DELETE FROM cheers WHERE created < ?`, [now - 86_400_000]);
  return { ok: true };
}

/** Everything needed to re-simulate a finished match shot by shot: opening rack, effective cues and the command log. */
export async function replayData(id: string) {
  const r = await one(
    `SELECT m.*, a.name AS n0, b.name AS n1 FROM matches m JOIN players a ON a.id = m.p0 JOIN players b ON b.id = m.p1 WHERE m.id = ?`,
    [id],
  );
  if (!r || r.status !== "done" || r.init == null) return null;
  const m = toMatch(r);
  return {
    id,
    mode: Number(r.mode),
    table: String(r.table_id),
    players: [String(r.n0), String(r.n1)],
    cues: m.cue,
    init: JSON.parse(String(r.init)),
    log: m.log,
    winner: Number(r.winner),
    reason: r.reason == null ? null : String(r.reason),
  };
}
