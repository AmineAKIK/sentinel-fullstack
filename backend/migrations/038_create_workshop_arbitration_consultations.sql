CREATE TABLE IF NOT EXISTS workshop_arbitration_consultations (
  request_event_id INTEGER PRIMARY KEY REFERENCES workshop_incident_events(id) ON DELETE CASCADE,
  incident_id INTEGER NOT NULL REFERENCES workshop_incidents(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('EDIT', 'CANCEL')),
  consulted_by_user_id INTEGER NOT NULL REFERENCES sentinel_users(id) ON DELETE RESTRICT,
  consulted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_arbitration_consultations_incident
  ON workshop_arbitration_consultations (incident_id);

CREATE INDEX IF NOT EXISTS idx_workshop_arbitration_consultations_user
  ON workshop_arbitration_consultations (consulted_by_user_id, consulted_at DESC);
