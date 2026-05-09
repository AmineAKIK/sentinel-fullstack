ALTER TABLE sentinel_users
  ADD CONSTRAINT chk_sentinel_users_role
  CHECK (role IN ('OPERATOR', 'MAINTENANCE', 'RESPONSABLE'));

ALTER TABLE workshop_incidents
  ADD CONSTRAINT chk_workshop_incidents_shift
  CHECK (shift IN ('MATIN', 'APRES_MIDI', 'NUIT', 'WEEKEND')),
  ADD CONSTRAINT chk_workshop_incidents_state
  CHECK (state IN ('SKIPEE_PAR_MACHINE', 'SKIPEE_PAR_CONDUCTEUR', 'DEGRADEE', 'INDISPONIBLE', 'AUTRE')),
  ADD CONSTRAINT chk_workshop_incidents_status
  CHECK (status IN ('OPEN', 'PENDING', 'CLOSED', 'CANCELED')),
  ADD CONSTRAINT chk_workshop_incidents_head_number
  CHECK (head_number > 0);

CREATE INDEX IF NOT EXISTS idx_sentinel_users_role_active
  ON sentinel_users (role, is_active)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_production_lines_active
  ON production_lines (is_active, line_number)
  WHERE is_deleted = FALSE;

CREATE INDEX IF NOT EXISTS idx_workshop_incidents_status_created
  ON workshop_incidents (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workshop_incidents_status_updated
  ON workshop_incidents (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workshop_incidents_line_status
  ON workshop_incidents (line_id, status);

CREATE INDEX IF NOT EXISTS idx_workshop_incidents_taken_active
  ON workshop_incidents (taken_by_user_id, status)
  WHERE taken_by_user_id IS NOT NULL AND status IN ('OPEN', 'PENDING');

CREATE INDEX IF NOT EXISTS idx_workshop_incidents_board_order
  ON workshop_incidents (status, is_priority DESC, is_taken ASC, display_order DESC, created_at DESC)
  WHERE status IN ('OPEN', 'PENDING');

CREATE INDEX IF NOT EXISTS idx_workshop_incident_events_type_created
  ON workshop_incident_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workshop_incident_events_actor_created
  ON workshop_incident_events (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;
