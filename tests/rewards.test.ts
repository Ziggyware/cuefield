import { test } from "node:test";
import assert from "node:assert/strict";
import { BOUNTIES, emptyStats, progression, recordShot } from "../shared/rewards.ts";
import type { Report } from "../shared/game/types.ts";
import { LocalSqlite } from "../server/sqlite.ts";
import { configureDatabase, migrate } from "../backend/db.ts";
import { rewardStatus, settleRewards } from "../backend/rewards.ts";

const report = (patch: Partial<Report> = {}): Report => ({ by: 0, foul: null, pocketed: [1], keep: true, respot: [], win: -1, hit: 1, need: 1, uncalled: false, assign: 0, end: null, ...patch });
test("legal runs, multi-pots, misses, fouls and opponent turns", () => {
  let s = recordShot(undefined, report({ pocketed: [1, 2] }));
  s = recordShot(s, report());
  assert.equal(s[0].bestRun, 3);
  assert.equal(s[0].multi, 2);
  assert.equal(s[0].multiBonus, 25);
  s = recordShot(s, report({ pocketed: [], keep: false }));
  assert.equal(s[0].run, 0);
  s = recordShot(s, report({ by: 1 }));
  assert.equal(s[0].bestRun, 3);
  assert.equal(s[1].pots, 1);
  s = recordShot(s, report({ foul: "scratch", pocketed: [0, 5], keep: false }));
  assert.equal(s[0].pots, 3);
  assert.equal(s[0].fouls, 1);
  s = recordShot(s, report({ pocketed: [9], respot: [9], keep: false }));
  assert.equal(s[0].pots, 3);
  s = recordShot(s, report({ uncalled: true }));
  assert.equal(s[0].pots, 3);
});
test("level boundaries and XP progress", () => {
  assert.equal(progression(0).level, 1);
  assert.equal(progression(249).level, 1);
  assert.equal(progression(250).level, 2);
  assert.equal(progression(1000).level, 3);
  assert.equal(progression(-10).xp, 0);
  assert.equal(progression(250).progress, 0);
});
test("server reward settlement against SQLite: daily goals, retries, streaks, floors and XP", async () => {
  const sqlite = new LocalSqlite(":memory:");
  const db = sqlite.db;
  configureDatabase(sqlite);
  await migrate();
  db.exec(`INSERT INTO players (id, token_hash, name, coins, rating, cue, cues, tables, created, xp)
    VALUES ('p', 'token', 'Player', 0, 1200, 'maple', '[]', '[]', 0, 0)`);
  const stats = { ...emptyStats(), shots: 5, scoring: 4, pots: 6, bestRun: 5, multi: 2, multiBonus: 25 };
  const first = await settleRewards("p", "m1", true, stats);
  assert.equal(first.reduce((sum: number, a: { amount: number }) => sum + a.amount, 0), 310);
  assert.deepEqual({ ...db.prepare("SELECT coins, xp FROM players").get() }, { coins: 310, xp: 310 });
  await settleRewards("p", "m1", true, stats);
  assert.equal(db.prepare("SELECT coins FROM players").get()!.coins, 310);
  await settleRewards("p", "m2", true, stats);
  const third = await settleRewards("p", "m3", true, stats);
  assert.ok(third.some((a: { title: string }) => a.title.includes("Hat trick")));
  await settleRewards("p", "m4-win", true, stats);
  const fifth = await settleRewards("p", "m5-win", true, stats);
  assert.ok(fifth.some((a: { title: string }) => a.title.includes("Unstoppable")));
  const status = await rewardStatus("p");
  assert.equal(status.goals.filter((b: { daily?: boolean; claimed: boolean }) => b.daily && b.claimed).length, 3);
  await settleRewards("p", "loss", false, stats);
  const afterLoss = await settleRewards("p", "m4", true, stats);
  assert.ok(!afterLoss.some((a: { title: string }) => a.title.includes("Hat trick")));
  const before = Number(db.prepare("SELECT xp FROM players").get()!.xp);
  db.exec("UPDATE players SET coins = MAX(0, coins - 100000)");
  assert.equal(db.prepare("SELECT coins FROM players").get()!.coins, 0);
  assert.equal(db.prepare("SELECT xp FROM players").get()!.xp, before);
  assert.throws(() => db.exec("UPDATE players SET coins = -1"), /negative-coins/);
  assert.equal((await settleRewards("p", "instant-concede", true, emptyStats())).length, 0);
  db.exec("UPDATE reward_matches SET day = day - 1; UPDATE reward_awards SET reward_key = 'old:' || reward_key");
  const newDay = await rewardStatus("p");
  assert.ok(newDay.goals.filter((b: { daily?: boolean }) => b.daily).every((b: { progress: number; claimed: boolean }) => b.progress === 0 && !b.claimed));
  assert.equal(BOUNTIES.length, 13);
  const lossAwards = await settleRewards("p", "participation", false, { ...emptyStats(), shots: 1 });
  assert.ok(lossAwards.some((a: { title: string; amount: number }) => a.title === "Rack completed" && a.amount === 40));
  sqlite.close();
});


test("each legal multi-pot earns extra cash; fouls and respots do not", () => {
  let s = recordShot(undefined, report({ pocketed: [1, 2, 3] }));
  assert.equal(s[0].multiBonus, 50);
  s = recordShot(s, report({ pocketed: [4, 5] }));
  assert.equal(s[0].multiBonus, 75);
  s = recordShot(s, report({ pocketed: [6, 7], foul: "scratch" }));
  s = recordShot(s, report({ pocketed: [6, 7], respot: [7] }));
  assert.equal(s[0].multiBonus, 75);
});

test("mixed called and incidental pots only reward the called pocket", async () => {
  const { newGame, geometry, settle } = await import("../shared/game/engine.ts");
  const { Sim } = await import("../shared/physics/sim.ts");
  const st = newGame(9, "arena", 1, 0); st.broken = true;
  const cmd = { k: "strike" as const, dx: 1_000_000, dy: 0, power: 500, tx: 0, ty: 0, el: 0, call: 0 };
  const simulate = (secondPocket: number) => {
    const balls = st.balls.map((b) => ({ ...b }));
    balls[1].on = false; balls[2].on = false;
    const sim = new Sim(balls, geometry(st.table));
    sim.events = [
      { k: "ball", t: 0.5, a: 0, b: 1, j: 1 },
      { k: "pocket", t: 1, a: 1, p: 0 },
      { k: "pocket", t: 1.5, a: 2, p: secondPocket },
    ];
    return settle(st, cmd, sim);
  };
  const mixed = simulate(1);
  assert.equal(mixed.last?.uncalled, false, "the called ball makes the shot legal");
  assert.equal(mixed.stats?.[0].pots, 1);
  assert.equal(mixed.stats?.[0].multiBonus, 0);
  const bothCalled = simulate(0);
  assert.equal(bothCalled.stats?.[0].pots, 2);
  assert.equal(bothCalled.stats?.[0].multiBonus, 25);
});
