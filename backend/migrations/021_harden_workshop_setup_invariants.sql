ALTER TABLE sentinel_users
  DROP CONSTRAINT IF EXISTS chk_password_setup_pair,
  ADD CONSTRAINT chk_password_setup_pair
    CHECK (
      (
        password_setup_token_hash IS NULL
        AND password_setup_expires_at IS NULL
      )
      OR (
        password_hash IS NULL
        AND password_setup_token_hash IS NOT NULL
        AND password_setup_expires_at IS NOT NULL
      )
    );

ALTER TABLE workshop_incidents
  DROP CONSTRAINT IF EXISTS chk_edit_request_shape,
  ADD CONSTRAINT chk_edit_request_shape
    CHECK (
      edit_request IS NULL
      OR (
        jsonb_typeof(edit_request) = 'object'
        AND (
          edit_request ? 'lineId'
          OR edit_request ? 'state'
          OR edit_request ? 'shift'
          OR edit_request ? 'machineId'
          OR edit_request ? 'robotLabel'
          OR edit_request ? 'headNumber'
          OR edit_request ? 'comment'
          OR edit_request ? 'currentProduct'
        )
      )
    );
