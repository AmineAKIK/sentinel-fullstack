CREATE TABLE IF NOT EXISTS account_audit_events (
  id SERIAL PRIMARY KEY,
  target_user_id INTEGER REFERENCES sentinel_users(id),
  admin_id INTEGER REFERENCES admin_accounts(id),
  event_type VARCHAR NOT NULL,
  changes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
