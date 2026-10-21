import { settleRewards } from "./rewards.ts";
import { BOT_CUES, BOT_DAILY_NET, botPot, cueById, isMode, type Mode, tableById } from "../shared/catalog.ts";
import { newGame, play } from "../shared/game/engine.ts";
import type { StrikeCmd } from "../shared/game/types.ts";
import { validate } from "../shared/game/validate.ts";
import { effectiveCue } from "../shared/upgrades.ts";
import { type Player, randomId } from "./auth.ts";
import { one, q } from "./db.ts";
import { parseCue } from "./match.ts";

const DAY = 86_400_000;
const MAX_SHOTS = 400;

/**
 * Opens a bot match: the venue fee is taken up front, and the server fixes the rack seed, breaker and both cues
 * so the finished log can be replayed. An abandoned match keeps the fee.
 */
export async function startSolo(p: Player, mode: unknown, table: unknown, level: unknown) {
  if (!isMode(mode)) return { error: "mode" };
  const lvl = Number(level);
  if (![0, 1, 2].includes(lvl)) return { error: "level" };
  const spec = typeof table === "string" ? tableById(table) : undefined;
  if (!spec) return { error: "table" };
  const paid = await q(`UPDATE players SET coins = coins - ? WHERE id = ? AND coins >= ? RETURNING coins`, [spec.fee, p.id, spec.fee]);
  if (!paid.length) return { error: "coins" };
  const id = randomId(10);
  const r = crypto.getRandomValues(new Uint32Array(1))[0];
  const seed = r >>> 1, breaker = r & 1;
  const cue = effectiveCue(cueById(p.cue), p.upgrades);
  await q(
    `INSERT INTO solo (id, player_id, mode, table_id, level, seed, breaker, cue, fee, created) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, p.id, mode, spec.id, lvl, seed, breaker, JSON.stringify(cue), spec.fee, Date.now()],
  );
  return { id, seed, breaker, cue, bot: cueById(BOT_CUES[lvl]), coins: Number(paid[0].coins) };
}

/**
 * Replays the whole log under the venue's rules with each side's cue. A verified win pays the pot: your fee back
 * plus the house stake, the house part capped per day. The row closes first so a log is claimed once.
 */
export async function finishSolo(p: Player, id: unknown, log: unknown) {
  const row = await one(`SELECT * FROM solo WHERE id = ? AND player_id = ?`, [String(id), p.id]);
  if (!row) return { error: "solo" };
  if (Number(row.done)) return { error: "done" };
  if (!Array.isArray(log) || log.length > MAX_SHOTS) return { error: "log" };
  const lvl = Number(row.level);
  const cues = [parseCue(String(row.cue)), cueById(BOT_CUES[lvl])];
  let st = newGame(Number(row.mode) as Mode, String(row.table_id), Number(row.seed), Number(row.breaker) as 0 | 1);
  for (const cmd of log as StrikeCmd[]) {
    if (st.winner >= 0) break;
    if (!cmd || cmd.k !== "strike") return { error: "log" };
    const cue = cues[st.turn];
    if (validate(st, cmd, cue)) return { error: "log" };
    st = play(st, cmd, cue).state;
  }
  if (st.winner < 0) return { error: "unfinished" };
  const closed = await q(`UPDATE solo SET done = 1, ended = ? WHERE id = ? AND done = 0 RETURNING id`, [Date.now(), row.id]);
  if (!closed.length) return { error: "done" };
  const fee = Number(row.fee);
  if (st.winner !== 0) {
    await q(`UPDATE solo SET won = 0 WHERE id = ?`, [row.id]);
    await q(`UPDATE players SET bot_losses = bot_losses + 1, earned = earned - ? WHERE id = ?`, [fee, p.id]);
    const bonuses = await settleRewards(p.id, `solo:${row.id}`, false, st.stats?.[0]);
    return { won: false, reward: 0, bonuses };
  }
  const today = Math.floor(Date.now() / DAY);
  const earned = p.solo_day === today ? p.solo_earned : 0;
  const house = Math.max(0, Math.min(botPot(tableById(String(row.table_id))!, lvl) - fee, BOT_DAILY_NET - earned));
  const reward = fee + house;
  await q(`UPDATE solo SET won = 1, pot = ? WHERE id = ?`, [reward, row.id]);
  await q(
    `UPDATE players SET coins = coins + ?, xp = xp + ?, earned = earned + ?, solo_day = ?, solo_earned = ?, bot_wins = bot_wins + 1 WHERE id = ?`,
    [reward, reward, house, today, earned + house, p.id],
  );
  const bonuses = await settleRewards(p.id, `solo:${row.id}`, true, st.stats?.[0]);
  return { won: true, reward, bonuses, capped: house < botPot(tableById(String(row.table_id))!, lvl) - fee };
}
