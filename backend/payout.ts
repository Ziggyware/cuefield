import { ELO_K, onlinePot, tableById } from "../shared/catalog.ts";
import { q } from "./db.ts";
import type { Match } from "./match.ts";

/** Winner takes both escrowed entry fees; ranked games move Elo; win streaks and net earnings feed the stats boards. */
export async function payout(m: Match, w: 0 | 1): Promise<void> {
  const spec = tableById(m.table)!;
  const winner = m.p[w], loser = m.p[1 - w];
  const pot = m.stake > 0 ? onlinePot(spec) : 0;
  const rs = await q(`SELECT id, rating FROM players WHERE id IN (?, ?)`, [winner, loser]);
  const ra = Number(rs.find((r) => r.id === winner)?.rating), rb = Number(rs.find((r) => r.id === loser)?.rating);
  const d = m.ranked ? ELO_K * (1 - 1 / (1 + Math.pow(10, (rb - ra) / 400))) : 0;
  await q(
    `UPDATE players SET coins = coins + ?, earned = earned + ?, wins = wins + 1, rating = rating + ?,
     win_streak = win_streak + 1, best_streak = MAX(best_streak, win_streak + 1) WHERE id = ?`,
    [pot, pot - m.stake, d, winner],
  );
  await q(`UPDATE players SET losses = losses + 1, rating = rating - ?, earned = earned - ?, win_streak = 0 WHERE id = ?`, [d, m.stake, loser]);
}
