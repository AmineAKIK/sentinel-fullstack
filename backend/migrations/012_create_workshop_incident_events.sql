CREATE TABLE IF NOT EXISTS workshop_incident_events (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES workshop_incidents(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES sentinel_users(id),
  event_type VARCHAR NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_incident_events_incident
  ON workshop_incident_events (incident_id, created_at DESC);
