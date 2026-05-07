ALTER TABLE workshop_incidents
  ADD COLUMN IF NOT EXISTS taken_by_user_id INTEGER REFERENCES sentinel_users(id),
  ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;
