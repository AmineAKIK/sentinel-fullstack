CREATE TABLE IF NOT EXISTS workshop_incidents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES sentinel_users(id),
  shift VARCHAR NOT NULL,
  line_id INTEGER NOT NULL REFERENCES production_lines(id),
  line_number VARCHAR NOT NULL,
  machine_id VARCHAR NOT NULL,
  machine_brand VARCHAR NOT NULL,
  robot_label VARCHAR NOT NULL,
  head_number INTEGER NOT NULL,
  state VARCHAR NOT NULL,
  comment TEXT,
  current_product VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_incidents_user_created
  ON workshop_incidents (user_id, created_at DESC);
