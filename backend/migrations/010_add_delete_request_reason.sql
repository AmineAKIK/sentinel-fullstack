ALTER TABLE workshop_incidents
  ADD COLUMN IF NOT EXISTS delete_request_reason TEXT;
