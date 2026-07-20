ALTER TABLE notification_outbox
  DROP CONSTRAINT notification_outbox_status_check;

ALTER TABLE notification_outbox
  ADD CONSTRAINT notification_outbox_status_check
  CHECK (status IN (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'SKIPPED_DISABLED',
    'SKIPPED_NO_RECIPIENT',
    'FAILED'
  ));
