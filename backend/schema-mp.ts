/** Multiplayer hub schema: presence, challenges, spectators, cheers, daily rack. Applied by migrate(). */
export const MP_TABLES = [
  `CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    mode INTEGER NOT NULL,
    table_id TEXT NOT NULL,
    assist INTEGER NOT NULL,
    corr INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open',
    match_id TEXT,
    created INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS invites_to ON invites(to_id, status, created)`,
  `CREATE TABLE IF NOT EXISTS watchers (
    match_id TEXT NOT NULL,
    viewer TEXT NOT NULL,
    seen INTEGER NOT NULL,
    PRIMARY KEY (match_id, viewer)
  )`,
  `CREATE TABLE IF NOT EXISTS cheers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    viewer TEXT NOT NULL,
    kind INTEGER NOT NULL,
    created INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS cheers_match ON cheers(match_id, id)`,
  `CREATE TABLE IF NOT EXISTS daily_runs (
    day INTEGER NOT NULL,
    player_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    created INTEGER NOT NULL,
    PRIMARY KEY (day, player_id)
  )`,
];

export const MP_COLS: [string, string][] = [
  ["players", "seen INTEGER NOT NULL DEFAULT 0"],
  ["matches", "init TEXT"],
  ["matches", "clock INTEGER"],
  ["rooms", "corr INTEGER NOT NULL DEFAULT 0"],
];

export const MP_INDEXES = [
  `CREATE INDEX IF NOT EXISTS players_seen ON players(seen)`,
  `CREATE INDEX IF NOT EXISTS matches_live ON matches(status, created)`,
];
