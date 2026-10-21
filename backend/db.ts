import { sqlite } from "https://esm.town/v/std/sqlite/main.ts";
import { MP_COLS, MP_INDEXES, MP_TABLES } from "./schema-mp.ts";

export { sqlite };

export type Row = Record<string, unknown>;

export async function q(sql: string, args: unknown[] = []): Promise<Row[]> {
  const r = await sqlite.execute({ sql, args: args as never });
  return r.rows as Row[];
}

export async function one(sql: string, args: unknown[] = []): Promise<Row | undefined> {
  return (await q(sql, args))[0];
}

let ready: Promise<void> | null = null;

export function migrate(): Promise<void> {
  ready ??= (async () => {
    await sqlite.batch([
      `CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        coins INTEGER NOT NULL,
        rating REAL NOT NULL,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        cue TEXT NOT NULL,
        cues TEXT NOT NULL,
        tables TEXT NOT NULL,
        daily_at INTEGER NOT NULL DEFAULT 0,
        streak INTEGER NOT NULL DEFAULT 0,
        free_day INTEGER NOT NULL DEFAULT 0,
        free_wins INTEGER NOT NULL DEFAULT 0,
        created INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS queue (
        player_id TEXT PRIMARY KEY,
        mode INTEGER NOT NULL,
        table_id TEXT NOT NULL,
        rating REAL NOT NULL,
        joined INTEGER NOT NULL,
        seen INTEGER NOT NULL,
        match_id TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        mode INTEGER NOT NULL,
        table_id TEXT NOT NULL,
        created INTEGER NOT NULL,
        match_id TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        mode INTEGER NOT NULL,
        table_id TEXT NOT NULL,
        p0 TEXT NOT NULL,
        p1 TEXT NOT NULL,
        cue0 TEXT NOT NULL,
        cue1 TEXT NOT NULL,
        stake INTEGER NOT NULL,
        ranked INTEGER NOT NULL,
        state TEXT NOT NULL,
        log TEXT NOT NULL,
        version INTEGER NOT NULL,
        deadline INTEGER NOT NULL,
        seen0 INTEGER NOT NULL,
        seen1 INTEGER NOT NULL,
        status TEXT NOT NULL,
        winner INTEGER NOT NULL DEFAULT -1,
        reason TEXT,
        rematch0 INTEGER NOT NULL DEFAULT 0,
        rematch1 INTEGER NOT NULL DEFAULT 0,
        next_id TEXT,
        created INTEGER NOT NULL,
        ended INTEGER
      )`,
      `CREATE INDEX IF NOT EXISTS matches_p0 ON matches(p0, created)`,
      `CREATE INDEX IF NOT EXISTS matches_p1 ON matches(p1, created)`,
      `CREATE TABLE IF NOT EXISTS mailbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT NOT NULL,
        to_idx INTEGER NOT NULL,
        body TEXT NOT NULL,
        created INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS mailbox_to ON mailbox(match_id, to_idx, id)`,
      `CREATE INDEX IF NOT EXISTS players_rating ON players(rating)`,
      `CREATE TABLE IF NOT EXISTS solo (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        mode INTEGER NOT NULL,
        table_id TEXT NOT NULL,
        level INTEGER NOT NULL,
        seed INTEGER NOT NULL,
        breaker INTEGER NOT NULL,
        cue TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        created INTEGER NOT NULL
      )`,
      ...MP_TABLES,
    ]);
    const cols: [string, string][] = [
      ["players", "upgrades TEXT NOT NULL DEFAULT '{}'"],
      ["players", "solo_day INTEGER NOT NULL DEFAULT 0"],
      ["players", "solo_earned INTEGER NOT NULL DEFAULT 0"],
      ["players", "unlocks TEXT NOT NULL DEFAULT '[\"basic\"]'"],
      ["players", "xp INTEGER NOT NULL DEFAULT -1"],
      ["players", "earned INTEGER NOT NULL DEFAULT 0"],
      ["players", "win_streak INTEGER NOT NULL DEFAULT 0"],
      ["players", "best_streak INTEGER NOT NULL DEFAULT 0"],
      ["players", "bot_wins INTEGER NOT NULL DEFAULT 0"],
      ["players", "bot_losses INTEGER NOT NULL DEFAULT 0"],
      ["solo", "fee INTEGER NOT NULL DEFAULT 0"],
      ["solo", "won INTEGER NOT NULL DEFAULT -1"],
      ["solo", "pot INTEGER NOT NULL DEFAULT 0"],
      ["solo", "ended INTEGER NOT NULL DEFAULT 0"],
      ["rooms", "assist INTEGER"],
      ["matches", "assist INTEGER"],
      ["players", "vt_id TEXT"],
      ...MP_COLS,
    ];
    for (const [t, col] of cols) {
      try {
        await sqlite.execute(`ALTER TABLE ${t} ADD COLUMN ${col}`);
      } catch {
        /* column already present */
      }
    }
    await sqlite.batch([
      `CREATE INDEX IF NOT EXISTS matches_ended ON matches(status, ended)`,
      `CREATE INDEX IF NOT EXISTS solo_ended ON solo(done, ended)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS players_vt ON players(vt_id)`,
      ...MP_INDEXES,
      `UPDATE players SET coins = MAX(0, coins) WHERE coins < 0`,
      `UPDATE players SET xp = MAX(0, coins) WHERE xp < 0`,
      `CREATE TABLE IF NOT EXISTS reward_matches (seq INTEGER PRIMARY KEY AUTOINCREMENT, player_id TEXT NOT NULL, match_id TEXT NOT NULL, day INTEGER NOT NULL, won INTEGER NOT NULL, pots INTEGER NOT NULL, stats TEXT NOT NULL, UNIQUE(player_id, match_id))`,
      `CREATE INDEX IF NOT EXISTS reward_matches_player ON reward_matches(player_id, seq DESC)`,
      `CREATE INDEX IF NOT EXISTS reward_matches_day ON reward_matches(player_id, day)`,
      `CREATE TABLE IF NOT EXISTS reward_awards (player_id TEXT NOT NULL, reward_key TEXT NOT NULL, match_id TEXT NOT NULL, title TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount > 0), PRIMARY KEY(player_id, reward_key))`,
      `CREATE TRIGGER IF NOT EXISTS reward_credit AFTER INSERT ON reward_awards BEGIN UPDATE players SET coins = coins + NEW.amount, xp = xp + NEW.amount, earned = earned + NEW.amount WHERE id = NEW.player_id; END`,
      `CREATE TRIGGER IF NOT EXISTS coins_floor_update BEFORE UPDATE OF coins ON players WHEN NEW.coins < 0 BEGIN SELECT RAISE(ABORT, 'negative-coins'); END`,
      `CREATE TRIGGER IF NOT EXISTS coins_floor_insert BEFORE INSERT ON players WHEN NEW.coins < 0 BEGIN SELECT RAISE(ABORT, 'negative-coins'); END`,
    ]);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}
