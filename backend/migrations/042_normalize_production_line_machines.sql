ALTER TABLE production_lines
  ADD CONSTRAINT chk_production_line_machine_sequence_array
  CHECK (jsonb_typeof(machine_sequence) = 'array');

DO $$
DECLARE
  duplicate_line TEXT;
  duplicate_machine TEXT;
BEGIN
  SELECT lower(btrim(line_number))
  INTO duplicate_line
  FROM production_lines
  WHERE is_deleted = FALSE
  GROUP BY lower(btrim(line_number))
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_line IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate normalized line number blocks migration: %', duplicate_line;
  END IF;

  SELECT lower(btrim(machine->>'machineId'))
  INTO duplicate_machine
  FROM production_lines pl
  CROSS JOIN LATERAL jsonb_array_elements(pl.machine_sequence) machine
  WHERE pl.is_deleted = FALSE
  GROUP BY lower(btrim(machine->>'machineId'))
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_machine IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate normalized machine id blocks migration: %', duplicate_machine;
  END IF;
END $$;

CREATE UNIQUE INDEX idx_production_lines_normalized_number_active
  ON production_lines (lower(btrim(line_number)))
  WHERE is_deleted = FALSE;

CREATE TABLE production_line_machines (
  line_id INTEGER NOT NULL REFERENCES production_lines(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  machine_id VARCHAR NOT NULL CHECK (btrim(machine_id) <> ''),
  normalized_machine_id VARCHAR GENERATED ALWAYS AS (lower(btrim(machine_id))) STORED,
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (line_id, position),
  UNIQUE (line_id, normalized_machine_id)
);

CREATE UNIQUE INDEX idx_production_line_machines_global_id
  ON production_line_machines (normalized_machine_id);

CREATE OR REPLACE FUNCTION sync_production_line_machines()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM production_line_machines WHERE line_id = NEW.id;

  IF NEW.is_deleted = FALSE THEN
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(NEW.machine_sequence) machine
      WHERE jsonb_typeof(machine) <> 'object'
         OR NULLIF(btrim(machine->>'machineId'), '') IS NULL
         OR NULLIF(btrim(machine->>'brand'), '') IS NULL
         OR jsonb_typeof(machine->'hasDoubleRobot') <> 'boolean'
    ) THEN
      RAISE EXCEPTION 'Invalid machine payload for production line %', NEW.id
        USING ERRCODE = '23514', CONSTRAINT = 'chk_production_line_machine_payload';
    END IF;

    INSERT INTO production_line_machines (line_id, position, machine_id, payload)
    SELECT NEW.id,
           (machine.ordinality - 1)::int,
           machine.value->>'machineId',
           machine.value
    FROM jsonb_array_elements(NEW.machine_sequence) WITH ORDINALITY AS machine(value, ordinality);
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_production_line_machines
AFTER INSERT OR UPDATE OF machine_sequence, is_deleted
ON production_lines
FOR EACH ROW
EXECUTE FUNCTION sync_production_line_machines();

INSERT INTO production_line_machines (line_id, position, machine_id, payload)
SELECT pl.id,
       (machine.ordinality - 1)::int,
       machine.value->>'machineId',
       machine.value
FROM production_lines pl
CROSS JOIN LATERAL jsonb_array_elements(pl.machine_sequence)
  WITH ORDINALITY AS machine(value, ordinality)
WHERE pl.is_deleted = FALSE;
