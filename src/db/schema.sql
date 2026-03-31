CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  segment TEXT NOT NULL DEFAULT '',
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS boards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  board_number INTEGER NOT NULL,
  dealer TEXT NOT NULL,
  vulnerability TEXT NOT NULL,
  hands TEXT NOT NULL,
  auction TEXT NOT NULL DEFAULT '[]',
  play TEXT NOT NULL DEFAULT '[]',
  contract TEXT,
  declarer TEXT,
  result TEXT,
  phase TEXT NOT NULL DEFAULT 'setup',
  UNIQUE(match_id, board_number)
);
