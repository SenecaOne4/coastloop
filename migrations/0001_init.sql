PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS screens (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  pair_code TEXT NOT NULL UNIQUE,
  name TEXT,
  location TEXT,
  playlist_id TEXT,
  paired_at TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image','video')),
  mime_type TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  duration_seconds INTEGER NOT NULL DEFAULT 15,
  bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS playlist_items (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  duration_seconds INTEGER,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS play_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screen_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (screen_id) REFERENCES screens(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_screens_device ON screens(device_id);
CREATE INDEX IF NOT EXISTS idx_screens_pair ON screens(pair_code);
CREATE INDEX IF NOT EXISTS idx_items_playlist ON playlist_items(playlist_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_events_screen_time ON play_events(screen_id, started_at);
