CREATE TABLE IF NOT EXISTS password_reset_requests (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES sentinel_users(id),
  badge_number VARCHAR NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_prr_user_id ON password_reset_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_prr_requested_at ON password_reset_requests(requested_at DESC);
