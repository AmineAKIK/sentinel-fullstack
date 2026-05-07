ALTER TABLE sentinel_users
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR;
