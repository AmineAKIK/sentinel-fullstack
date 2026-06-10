-- Adds a session_version counter to admin_credentials.
-- Incrementing this value on password change invalidates all existing tokens.
ALTER TABLE admin_accounts
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 1;
