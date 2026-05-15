CREATE TABLE IF NOT EXISTS workshop_incident_followers (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES workshop_incidents(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES sentinel_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_workshop_incident_follower
  ON workshop_incident_followers (incident_id, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_incident_followers_user_active
  ON workshop_incident_followers (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_incident_followers_incident_active
  ON workshop_incident_followers (incident_id)
  WHERE deleted_at IS NULL;
