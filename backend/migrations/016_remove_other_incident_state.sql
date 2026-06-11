UPDATE workshop_incidents
SET state = 'DEGRADEE'
WHERE state = 'AUTRE';

ALTER TABLE workshop_incidents
  DROP CONSTRAINT IF EXISTS chk_workshop_incidents_state,
  ADD CONSTRAINT chk_workshop_incidents_state
  CHECK (state IN ('SKIPEE_PAR_MACHINE', 'SKIPEE_PAR_CONDUCTEUR', 'DEGRADEE', 'INDISPONIBLE'));
