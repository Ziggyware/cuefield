import { CUES, DAILY_BASE, DAILY_CAP, DAILY_STEP } from "../shared/catalog.ts";
import { SOCIAL } from "../shared/social.ts";
import { featurePrice } from "../shared/features.ts";
import { levelOf, MAX_LEVEL, UPGRADES } from "../shared/upgrades.ts";
import type { Player } from "./auth.ts";
import { one, q } from "./db.ts";

const DAY = 86_400_000;

export function dailyReady(p: Player, now = Date.now()): boolean {
  return now - p.daily_at >= DAY;
}

export function view(p: Player) {
  const now = Date.now();
  return {
    id: p.id,
    name: p.name,
    coins: p.coins,
    rating: Math.round(p.rating),
    wins: p.wins,
    losses: p.losses,
    cue: p.cue,
    cues: p.cues,
    unlocks: p.unlocks,
    account: p.vt_id ? "valtown" : "guest",
    daily: dailyReady(p, now) ? 0 : p.daily_at + DAY - now,
    streak: p.streak,
    upgrades: p.upgrades,
    earned: p.earned,
    winStreak: p.win_streak,
    bestStreak: p.best_streak,
    botWins: p.bot_wins,
    botLosses: p.bot_losses,
  };
}

export async function rename(p: Player, name: string) {
  await q(`UPDATE players SET name = ? WHERE id = ?`, [name, p.id]);
  return { ...p, name };
}

/** Streak continues if claimed within 48 h of the previous claim. */
export async function claimDaily(p: Player): Promise<{ amount: number } | { error: string }> {
  const now = Date.now();
  if (!dailyReady(p, now)) return { error: "daily-wait" };
  const streak = now - p.daily_at < 2 * DAY ? p.streak + 1 : 1;
  const amount = DAILY_BASE + DAILY_STEP * Math.min(streak - 1, DAILY_CAP);
  const r = await q(
    `UPDATE players SET coins = coins + ?, daily_at = ?, streak = ? WHERE id = ? AND daily_at = ? RETURNING coins`,
    [amount, now, streak, p.id, p.daily_at],
  );
  return r.length ? { amount } : { error: "daily-wait" };
}

/** Cues, social unlocks (emote packs, free chat) and feature/ring unlocks; the guard on the stored JSON makes concurrent purchases fail cleanly. */
export async function buy(p: Player, kind: unknown, id: unknown): Promise<{ ok: true } | { error: string }> {
  const fp = kind === "feature" ? featurePrice(id) : null;
  const item = kind === "cue"
    ? CUES.find((c) => c.id === id)
    : kind === "social"
    ? SOCIAL.find((t) => t.id === id)
    : fp !== null
    ? { id: String(id), price: fp }
    : undefined;
  if (!item) return { error: "item" };
  const owned = kind === "cue" ? p.cues : p.unlocks;
  if (owned.includes(item.id)) return { error: "owned" };
  const col = kind === "cue" ? "cues" : "unlocks";
  const next = JSON.stringify([...owned, item.id]);
  const r = await q(
    `UPDATE players SET coins = coins - ?, ${col} = ? WHERE id = ? AND coins >= ? AND ${col} = ? RETURNING coins`,
    [item.price, next, p.id, item.price, JSON.stringify(owned)],
  );
  return r.length ? { ok: true } : { error: "coins" };
}

/** Next level of an upgrade track; the guard on the stored JSON makes concurrent purchases fail cleanly. */
export async function buyUpgrade(p: Player, track: unknown): Promise<{ ok: true } | { error: string }> {
  const def = UPGRADES.find((u) => u.id === track);
  if (!def) return { error: "item" };
  const lvl = levelOf(p.upgrades, def.id);
  if (lvl >= MAX_LEVEL) return { error: "max" };
  const cost = def.costs[lvl];
  const prev = JSON.stringify(p.upgrades);
  const next = JSON.stringify({ ...p.upgrades, [def.id]: lvl + 1 });
  const r = await q(`UPDATE players SET coins = coins - ?, upgrades = ? WHERE id = ? AND coins >= ? AND upgrades = ? RETURNING coins`, [
    cost,
    next,
    p.id,
    cost,
    prev,
  ]);
  return r.length ? { ok: true } : { error: "coins" };
}

export async function equip(p: Player, id: unknown): Promise<{ ok: true } | { error: string }> {
  if (typeof id !== "string" || !p.cues.includes(id)) return { error: "item" };
  await q(`UPDATE players SET cue = ? WHERE id = ?`, [id, p.id]);
  return { ok: true };
}

export async function leaderboard() {
  const rows = await q(`SELECT id, name, rating, wins, losses FROM players WHERE wins + losses > 0 ORDER BY rating DESC LIMIT 50`);
  return rows.map((r) => ({ id: r.id, name: r.name, rating: Math.round(Number(r.rating)), wins: r.wins, losses: r.losses }));
}

export async function publicName(id: string): Promise<{ name: string; rating: number } | null> {
  const r = await one(`SELECT name, rating FROM players WHERE id = ?`, [id]);
  return r ? { name: String(r.name), rating: Math.round(Number(r.rating)) } : null;
}
