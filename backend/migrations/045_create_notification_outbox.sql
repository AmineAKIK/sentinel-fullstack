WITH ranked_pending AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY requested_at DESC, id DESC) AS rank
  FROM password_reset_requests
  WHERE handled_at IS NULL
)
UPDATE password_reset_requests prr
SET handled_at = NOW()
FROM ranked_pending ranked
WHERE prr.id = ranked.id
  AND ranked.rank > 1;

CREATE UNIQUE INDEX idx_password_reset_requests_one_pending_per_user
  ON password_reset_requests (user_id)
  WHERE handled_at IS NULL;

CREATE INDEX idx_password_reset_requests_pending_requested
  ON password_reset_requests (requested_at DESC)
  WHERE handled_at IS NULL;

CREATE TABLE notification_outbox (
  id BIGSERIAL PRIMARY KEY,
  source_event_id INTEGER REFERENCES workshop_incident_events(id) ON DELETE CASCADE,
  password_reset_request_id INTEGER REFERENCES password_reset_requests(id) ON DELETE CASCADE,
  status VARCHAR NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_notification_outbox_single_source CHECK (
    (source_event_id IS NOT NULL AND password_reset_request_id IS NULL)
    OR (source_event_id IS NULL AND password_reset_request_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_notification_outbox_event_once
  ON notification_outbox (source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX idx_notification_outbox_password_reset_once
  ON notification_outbox (password_reset_request_id)
  WHERE password_reset_request_id IS NOT NULL;

CREATE INDEX idx_notification_outbox_ready
  ON notification_outbox (available_at, id)
  WHERE status = 'PENDING';

CREATE INDEX idx_notification_outbox_stale_processing
  ON notification_outbox (locked_at)
  WHERE status = 'PROCESSING';
