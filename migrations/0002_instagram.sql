CREATE TABLE instagram_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL, account_id TEXT NOT NULL, username TEXT NOT NULL,
  token TEXT NOT NULL, expires INTEGER NOT NULL, refreshed INTEGER NOT NULL,
  reconnect INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE instagram_states (
  hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_hash TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE instagram_jobs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL, revision INTEGER NOT NULL, connection_id TEXT NOT NULL,
  account_id TEXT NOT NULL, username TEXT NOT NULL, snapshot TEXT NOT NULL,
  caption TEXT NOT NULL, request_key TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'preparing',
  parent_id TEXT, media_id TEXT, permalink TEXT, error TEXT,
  lease TEXT, lease_until INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL, updated INTEGER NOT NULL, expires INTEGER NOT NULL,
  UNIQUE(user_id, request_key)
);
CREATE INDEX instagram_jobs_project ON instagram_jobs(user_id, project_id, created DESC);
CREATE INDEX instagram_jobs_recovery ON instagram_jobs(status, lease_until);
CREATE TABLE instagram_slides (
  job_id TEXT NOT NULL REFERENCES instagram_jobs(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, object_key TEXT NOT NULL, container_id TEXT,
  ready INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(job_id, position)
);
