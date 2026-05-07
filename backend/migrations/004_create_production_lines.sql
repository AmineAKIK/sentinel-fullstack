CREATE TABLE IF NOT EXISTS production_lines (
  id SERIAL PRIMARY KEY,
  line_number VARCHAR NOT NULL,
  machine_sequence JSONB NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_production_lines_line_number_active
  ON production_lines (line_number)
  WHERE is_deleted = FALSE;
