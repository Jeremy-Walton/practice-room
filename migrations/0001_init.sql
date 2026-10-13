-- Already applied to the practice-room D1 database on 2026-10-09.
-- Kept here so the schema lives with the code.
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,          -- "plan", "quiz", or "log-YYYY-MM"
  body TEXT NOT NULL,           -- JSON
  updated_at INTEGER NOT NULL,  -- when the change was made on the device (ms)
  server_at INTEGER NOT NULL    -- when the server stored it (ms); used for pulls
);
CREATE INDEX IF NOT EXISTS docs_server_at ON docs(server_at);
