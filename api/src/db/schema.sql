CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  segment TEXT NOT NULL DEFAULT '',
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS boards (
  id SERIAL PRIMARY KEY,
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  board_number INTEGER NOT NULL,
  dealer TEXT NOT NULL,
  vulnerability TEXT NOT NULL,
  hands JSONB NOT NULL,
  auction JSONB NOT NULL DEFAULT '[]',
  play JSONB NOT NULL DEFAULT '[]',
  contract JSONB,
  declarer TEXT,
  result JSONB,
  phase TEXT NOT NULL DEFAULT 'setup',
  UNIQUE(match_id, board_number)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
