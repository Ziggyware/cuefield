import { test } from "node:test";
import assert from "node:assert/strict";
import { LocalSqlite } from "../server/sqlite.ts";
import { configureDatabase, migrate } from "../backend/db.ts";
import { playerById } from "../backend/auth.ts";
import { startSolo } from "../backend/solo.ts";

test("migration preserves old solos and pins a daily cutover; new solos negotiate physics", async () => {
  const sqlite = new LocalSqlite(":memory:");
  const db = sqlite.db;
  db.exec(`CREATE TABLE players (
    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, coins INTEGER NOT NULL,
    rating REAL NOT NULL, wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
    cue TEXT NOT NULL, cues TEXT NOT NULL, tables TEXT NOT NULL, daily_at INTEGER NOT NULL DEFAULT 0,
    streak INTEGER NOT NULL DEFAULT 0, free_day INTEGER NOT NULL DEFAULT 0, free_wins INTEGER NOT NULL DEFAULT 0,
    created INTEGER NOT NULL
  );
  INSERT INTO players (id, token_hash, name, coins, rating, cue, cues, tables, created)
    VALUES ('p', 'token', 'Player', 5000, 1200, 'maple', '[]', '[]', 0);
  CREATE TABLE solo (id TEXT PRIMARY KEY, player_id TEXT NOT NULL, mode INTEGER NOT NULL, table_id TEXT NOT NULL,
    level INTEGER NOT NULL, seed INTEGER NOT NULL, breaker INTEGER NOT NULL, cue TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL);
  INSERT INTO solo VALUES ('old', 'p', 9, 'garage', 0, 1, 0, '{}', 0, 0);`);

  const now = Date.now;
  Date.now = () => 100 * 86_400_000;
  try {
    configureDatabase(sqlite);
    await migrate();
    assert.equal(db.prepare("SELECT physics FROM solo WHERE id = 'old'").get()!.physics, 1);
    assert.equal(db.prepare("SELECT value FROM game_config WHERE name = 'physics-v2-day'").get()!.value, 101);

    // A cold start on a later day cannot move the one-time cutover.
    Date.now = () => 110 * 86_400_000;
    configureDatabase(sqlite);
    await migrate();
    assert.equal(db.prepare("SELECT value FROM game_config WHERE name = 'physics-v2-day'").get()!.value, 101);

    const player = (await playerById("p"))!;
    const oldClient = await startSolo(player, 9, "garage", 0);
    const newClient = await startSolo(player, 9, "garage", 0, 2);
    assert.ok("physics" in oldClient && "physics" in newClient);
    assert.equal(oldClient.physics, 1);
    assert.equal(newClient.physics, 2);
    assert.equal(db.prepare("SELECT physics FROM solo WHERE id = ?").get(oldClient.id)!.physics, 1);
    assert.equal(db.prepare("SELECT physics FROM solo WHERE id = ?").get(newClient.id)!.physics, 2);
  } finally {
    Date.now = now;
    sqlite.close();
  }
});

test("standalone SQLite batches roll back together on failure", async () => {
  const sqlite = new LocalSqlite(":memory:");
  try {
    sqlite.db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY)");
    await assert.rejects(sqlite.batch([
      { sql: "INSERT INTO sample VALUES (?)", args: [1] },
      { sql: "INSERT INTO sample VALUES (?)", args: [1] },
    ]), /UNIQUE/);
    assert.equal(sqlite.db.prepare("SELECT COUNT(*) AS n FROM sample").get()!.n, 0);
  } finally {
    sqlite.close();
  }
});

test("standalone transactions isolate concurrent requests and roll back nested batches", async () => {
  const sqlite = new LocalSqlite(":memory:");
  sqlite.db.exec("CREATE TABLE sample (id INTEGER PRIMARY KEY)");
  let signal!: () => void, release!: () => void;
  const started = new Promise<void>((done) => { signal = done; });
  const gate = new Promise<void>((done) => { release = done; });
  try {
    const first = sqlite.transaction(async () => {
      await sqlite.execute("INSERT INTO sample VALUES (1)");
      signal();
      await gate;
      await sqlite.batch(["INSERT INTO sample VALUES (2)"]);
    });
    await started;
    let finished = false;
    const second = sqlite.execute("INSERT INTO sample VALUES (3)").then(() => { finished = true; });
    await new Promise<void>((done) => setImmediate(done));
    assert.equal(finished, false, "another request must wait for the transaction");
    release();
    await Promise.all([first, second]);
    assert.deepEqual(sqlite.db.prepare("SELECT id FROM sample ORDER BY rowid").all().map((r) => r.id), [1, 2, 3]);
    await assert.rejects(sqlite.transaction(async () => {
      await sqlite.batch(["INSERT INTO sample VALUES (4)"]);
      throw new Error("abort");
    }), /abort/);
    assert.equal(sqlite.db.prepare("SELECT COUNT(*) AS n FROM sample").get()!.n, 3);
  } finally {
    release();
    sqlite.close();
  }
});
