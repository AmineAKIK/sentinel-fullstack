DO $$
DECLARE
  duplicate_badge TEXT;
BEGIN
  SELECT lower(btrim(badge_number))
  INTO duplicate_badge
  FROM sentinel_users
  WHERE is_deleted = FALSE
  GROUP BY lower(btrim(badge_number))
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_badge IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate normalized badge blocks migration: %', duplicate_badge;
  END IF;
END $$;

CREATE UNIQUE INDEX idx_sentinel_users_normalized_badge_active
  ON sentinel_users (lower(btrim(badge_number)))
  WHERE is_deleted = FALSE;

ALTER TABLE sentinel_users
  ADD CONSTRAINT chk_sentinel_users_identity_fields
    CHECK (
      char_length(btrim(first_name)) BETWEEN 2 AND 80
      AND char_length(btrim(last_name)) BETWEEN 2 AND 80
      AND char_length(btrim(badge_number)) BETWEEN 2 AND 40
    ),
  ADD CONSTRAINT chk_sentinel_users_email_length
    CHECK (email IS NULL OR char_length(email) <= 254);
