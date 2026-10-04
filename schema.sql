CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  display_name TEXT
);

CREATE TABLE IF NOT EXISTS copybooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT DEFAULT '未命名',
  chars TEXT NOT NULL,
  strokes TEXT DEFAULT '',
  grid_size INTEGER DEFAULT 8,
  font_family TEXT DEFAULT 'KaiTi',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  fail_count INTEGER DEFAULT 0,
  locked_until TEXT
);

CREATE TABLE IF NOT EXISTS captcha_challenges (
  id TEXT PRIMARY KEY,
  answer TEXT,
  expires_at TEXT
);
