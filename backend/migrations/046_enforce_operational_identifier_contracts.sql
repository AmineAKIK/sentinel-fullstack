DO $$
DECLARE
  invalid_badge TEXT;
  invalid_line TEXT;
  invalid_admin TEXT;
BEGIN
  SELECT badge_number
  INTO invalid_badge
  FROM sentinel_users
  WHERE is_deleted = FALSE
    AND (badge_number <> btrim(badge_number) OR badge_number !~ '^[0-9]+$')
  ORDER BY id
  LIMIT 1;

  IF invalid_badge IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 046 blocked: active workshop badge must contain digits only (value: %).',
      invalid_badge;
  END IF;

  SELECT line_number
  INTO invalid_line
  FROM production_lines
  WHERE is_deleted = FALSE
    AND (line_number <> btrim(line_number) OR line_number !~ '^[0-9]+$')
  ORDER BY id
  LIMIT 1;

  IF invalid_line IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 046 blocked: active production line number must contain digits only (value: %).',
      invalid_line;
  END IF;

  SELECT username
  INTO invalid_admin
  FROM admin_accounts
  WHERE username <> btrim(username)
     OR btrim(username) = ''
     OR char_length(username) > 80
     OR username ~ '^[0-9]+$'
  ORDER BY id
  LIMIT 1;

  IF invalid_admin IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 046 blocked: administrator username must be trimmed, 1-80 characters and not numeric-only (value: %).',
      invalid_admin;
  END IF;
END $$;

ALTER TABLE sentinel_users
  ADD CONSTRAINT chk_sentinel_users_badge_numeric
    CHECK (
      is_deleted
      OR (badge_number = btrim(badge_number) AND badge_number ~ '^[0-9]+$')
    );

ALTER TABLE production_lines
  ADD CONSTRAINT chk_production_lines_number_numeric
    CHECK (
      is_deleted
      OR (line_number = btrim(line_number) AND line_number ~ '^[0-9]+$')
    );

ALTER TABLE admin_accounts
  ADD CONSTRAINT chk_admin_username_namespace
    CHECK (
      username = btrim(username)
      AND username <> ''
      AND char_length(username) <= 80
      AND username !~ '^[0-9]+$'
    );
