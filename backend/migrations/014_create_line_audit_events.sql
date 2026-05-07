CREATE TABLE IF NOT EXISTS line_audit_events (
  id SERIAL PRIMARY KEY,
  target_line_id INTEGER REFERENCES production_lines(id),
  admin_id INTEGER REFERENCES admin_accounts(id),
  event_type VARCHAR NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_audit_events_created
  ON line_audit_events (created_at DESC);
