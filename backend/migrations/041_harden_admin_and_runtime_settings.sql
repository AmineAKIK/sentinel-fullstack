DO $$
BEGIN
  IF (SELECT COUNT(*) FROM admin_accounts) > 1 THEN
    RAISE EXCEPTION
      'Sentinel supports one administrator account, but % rows exist in admin_accounts.',
      (SELECT COUNT(*) FROM admin_accounts);
  END IF;
END $$;

ALTER TABLE admin_accounts
  ADD COLUMN singleton_key SMALLINT NOT NULL DEFAULT 1,
  ALTER COLUMN board_code_hash TYPE VARCHAR(128);

ALTER TABLE admin_accounts
  ADD CONSTRAINT chk_admin_singleton_key CHECK (singleton_key = 1),
  ADD CONSTRAINT uq_admin_singleton_key UNIQUE (singleton_key);

UPDATE admin_accounts
SET session_duration_hours = GREATEST(1, LEAST(session_duration_hours, 168)),
    workshop_session_hours = GREATEST(1, LEAST(workshop_session_hours, 168)),
    board_session_ttl_hours = GREATEST(1, LEAST(board_session_ttl_hours, 168)),
    login_max_attempts = GREATEST(3, LEAST(login_max_attempts, 50)),
    setup_code_ttl_hours = GREATEST(1, LEAST(setup_code_ttl_hours, 72));

ALTER TABLE admin_accounts
  ADD CONSTRAINT chk_admin_session_duration CHECK (session_duration_hours BETWEEN 1 AND 168),
  ADD CONSTRAINT chk_workshop_session_duration CHECK (workshop_session_hours BETWEEN 1 AND 168),
  ADD CONSTRAINT chk_board_session_duration CHECK (board_session_ttl_hours BETWEEN 1 AND 168),
  ADD CONSTRAINT chk_login_max_attempts CHECK (login_max_attempts BETWEEN 3 AND 50),
  ADD CONSTRAINT chk_setup_code_duration CHECK (setup_code_ttl_hours BETWEEN 1 AND 72),
  ADD CONSTRAINT chk_board_label_not_blank CHECK (btrim(board_label) <> '');
