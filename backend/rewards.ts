import { BOUNTIES, emptyStats, type RackStats } from "../shared/rewards.ts";
import { one, q, sqlite } from "./db.ts";

/** Ledger insertion and its credit trigger are one SQLite statement: retry-safe, never client-claimed. */
export async function settleRewards(player: string, match: string, won: boolean, stats: RackStats = emptyStats()) {
  const day = Math.floor(Date.now() / 86_400_000);
  await q(`INSERT OR IGNORE INTO reward_matches (player_id, match_id, day, won, pots, stats) VALUES (?,?,?,?,?,?)`,
    [player, match, day, won && stats.shots > 0 ? 1 : 0, stats.pots, JSON.stringify(stats)]);
  const rows = await q(`SELECT match_id, won FROM reward_matches WHERE player_id = ? ORDER BY seq DESC`, [player]);
  let streak = 0;
  for (const row of rows) { if (!Number(row.won)) break; streak++; }
  const daily = await one(`SELECT COUNT(*) AS plays, SUM(pots) AS pots, SUM(won) AS wins FROM reward_matches WHERE player_id = ? AND day = ? AND json_extract(stats, '$.shots') > 0`, [player, day]);
  // A player must have taken a shot to earn match rewards (no instant-concede farming).
  if (stats.shots > 0) {
    const awards = BOUNTIES.filter((b) => {
      if (b.daily) return Number(daily?.[b.metric === "win" ? "wins" : b.metric] ?? 0) >= b.target;
      if (b.metric === "streak") return won && streak > 0 && streak % b.target === 0;
      if (b.metric === "win") return won;
      if (b.metric === "plays") return true;
      if (b.metric === "clean") return won && stats.fouls === 0;
      return Number(stats[b.metric as keyof RackStats] ?? 0) >= b.target;
    }).map((b) => ({
      sql: `INSERT OR IGNORE INTO reward_awards (player_id, reward_key, match_id, title, amount) VALUES (?,?,?,?,?)`,
      args: [player, `${b.daily ? `day:${day}` : match}:${b.id}`, match, b.title, b.amount],
    }));
    if (Number.isSafeInteger(stats.multiBonus) && (stats.multiBonus ?? 0) > 0) {
      awards.push({
        sql: `INSERT OR IGNORE INTO reward_awards (player_id, reward_key, match_id, title, amount) VALUES (?,?,?,?,?)`,
        args: [player, `${match}:multi-shots`, match, "Multi-ball shot bonuses", stats.multiBonus!],
      });
    }
    if (awards.length) await sqlite.batch(awards);
  }
  return q(`SELECT title, amount FROM reward_awards WHERE player_id = ? AND match_id = ?`, [player, match]);
}

export async function rewardStatus(player: string) {
  const day = Math.floor(Date.now() / 86_400_000);
  const d = await one(`SELECT COUNT(*) AS plays, COALESCE(SUM(pots),0) AS pots, COALESCE(SUM(won),0) AS wins FROM reward_matches WHERE player_id = ? AND day = ? AND json_extract(stats, '$.shots') > 0`, [player, day]);
  const claimed = await q(`SELECT reward_key FROM reward_awards WHERE player_id = ? AND reward_key LIKE ?`, [player, `day:${day}:%`]);
  return { resets: (day + 1) * 86_400_000, goals: BOUNTIES.map((b) => ({ ...b, progress: b.daily ? Math.min(b.target, Number(d?.[b.metric === "win" ? "wins" : b.metric] ?? 0)) : 0, claimed: claimed.some((r) => r.reward_key === `day:${day}:${b.id}`) })) };
}
