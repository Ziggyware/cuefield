import { cueById } from "../shared/catalog.ts";
import { DAILY, dailySeed, dayOf, scoreRun } from "../shared/game/daily.ts";
import { effectiveCue } from "../shared/upgrades.ts";
import type { Player } from "./auth.ts";
import { one, q } from "./db.ts";

async function board(day: number) {
  const rows = await q(
    `SELECT p.name, d.score FROM daily_runs d JOIN players p ON p.id = d.player_id WHERE d.day = ? ORDER BY d.score, d.created LIMIT 20`,
    [day],
  );
  return rows.map((r) => ({ name: String(r.name), score: Number(r.score) }));
}

/** Rank of a score on the day: 1 + runs strictly better. */
async function rankOf(day: number, score: number): Promise<number> {
  const r = await one(`SELECT COUNT(*) AS n FROM daily_runs WHERE day = ? AND score < ?`, [day, score]);
  return Number(r?.n ?? 0) + 1;
}

export async function dailyInfo(p: Player) {
  const day = dayOf(Date.now());
  const mine = await one(`SELECT score FROM daily_runs WHERE day = ? AND player_id = ?`, [day, p.id]);
  return {
    day,
    seed: dailySeed(day),
    mode: DAILY.mode,
    table: DAILY.table,
    reward: DAILY.reward,
    ends: (day + 1) * 86_400_000 - Date.now(),
    board: await board(day),
    best: mine ? Number(mine.score) : null,
    cue: effectiveCue(cueById(p.cue), p.upgrades),
  };
}

/**
 * Server replay of a cleared rack. The first verified clear of the day pays the reward; later runs only improve the
 * stored best. The day is the one the client played, accepted until an hour past midnight UTC.
 */
export async function finishDaily(p: Player, day: unknown, log: unknown) {
  const today = dayOf(Date.now()), late = dayOf(Date.now() - 3_600_000);
  if (day !== today && day !== late) return { error: "day" };
  const run = scoreRun(day, log, effectiveCue(cueById(p.cue), p.upgrades));
  if ("error" in run) return run;
  const prev = await one(`SELECT score FROM daily_runs WHERE day = ? AND player_id = ?`, [day, p.id]);
  let paid = 0;
  if (!prev) {
    const ins = await q(`INSERT OR IGNORE INTO daily_runs (day, player_id, score, created) VALUES (?,?,?,?) RETURNING day`, [day, p.id, run.score, Date.now()]);
    if (ins.length) {
      paid = DAILY.reward;
      await q(`UPDATE players SET coins = coins + ?, earned = earned + ?, xp = xp + ? WHERE id = ?`, [paid, paid, paid, p.id]);
    }
  } else if (run.score < Number(prev.score)) {
    await q(`UPDATE daily_runs SET score = ?, created = ? WHERE day = ? AND player_id = ?`, [run.score, Date.now(), day, p.id]);
  }
  const best = Math.min(run.score, prev ? Number(prev.score) : Infinity);
  return { ...run, best, rank: await rankOf(day, best), reward: paid };
}
