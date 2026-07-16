CREATE OR REPLACE FUNCTION is_valid_production_line_machine(machine JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  heads NUMERIC;
BEGIN
  IF jsonb_typeof(machine) IS DISTINCT FROM 'object'
     OR jsonb_typeof(machine->'machineId') IS DISTINCT FROM 'string'
     OR btrim(machine->>'machineId') = ''
     OR char_length(machine->>'machineId') > 50
     OR (machine->>'machineId') !~ '^[A-Za-z0-9_-]+$'
     OR jsonb_typeof(machine->'brand') IS DISTINCT FROM 'string'
     OR btrim(machine->>'brand') = ''
     OR char_length(machine->>'brand') > 100
     OR jsonb_typeof(machine->'hasDoubleRobot') IS DISTINCT FROM 'boolean'
  THEN
    RETURN FALSE;
  END IF;

  IF (machine->>'hasDoubleRobot')::boolean THEN
    IF jsonb_typeof(machine->'leftRobotNumber') IS DISTINCT FROM 'string'
       OR btrim(machine->>'leftRobotNumber') = ''
       OR char_length(machine->>'leftRobotNumber') > 50
       OR jsonb_typeof(machine->'rightRobotNumber') IS DISTINCT FROM 'string'
       OR btrim(machine->>'rightRobotNumber') = ''
       OR char_length(machine->>'rightRobotNumber') > 50
       OR jsonb_typeof(machine->'leftRobotHeads') IS DISTINCT FROM 'number'
       OR jsonb_typeof(machine->'rightRobotHeads') IS DISTINCT FROM 'number'
    THEN
      RETURN FALSE;
    END IF;

    heads := (machine->>'leftRobotHeads')::numeric;
    IF heads <> trunc(heads) OR heads < 1 OR heads > 64 THEN RETURN FALSE; END IF;
    heads := (machine->>'rightRobotHeads')::numeric;
    RETURN heads = trunc(heads) AND heads BETWEEN 1 AND 64;
  END IF;

  IF jsonb_typeof(machine->'robotNumber') IS DISTINCT FROM 'string'
     OR btrim(machine->>'robotNumber') = ''
     OR char_length(machine->>'robotNumber') > 50
     OR jsonb_typeof(machine->'robotHeads') IS DISTINCT FROM 'number'
  THEN
    RETURN FALSE;
  END IF;

  heads := (machine->>'robotHeads')::numeric;
  RETURN heads = trunc(heads) AND heads BETWEEN 1 AND 64;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN FALSE;
END $$;

CREATE OR REPLACE FUNCTION is_valid_production_line_machine_sequence(sequence JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF jsonb_typeof(sequence) IS DISTINCT FROM 'array'
     OR jsonb_array_length(sequence) NOT BETWEEN 1 AND 10
  THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
       SELECT 1
       FROM jsonb_array_elements(sequence) machine
       WHERE NOT is_valid_production_line_machine(machine)
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(sequence) machine
       GROUP BY lower(btrim(machine->>'machineId'))
       HAVING COUNT(*) > 1
     )
  THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END $$;

ALTER TABLE production_lines
  ADD CONSTRAINT chk_production_line_number
    CHECK (btrim(line_number) <> '' AND char_length(line_number) <= 40),
  DROP CONSTRAINT chk_production_line_machine_sequence_array,
  ADD CONSTRAINT chk_production_line_machine_sequence
    CHECK (is_valid_production_line_machine_sequence(machine_sequence));

ALTER TABLE production_line_machines
  DROP CONSTRAINT production_line_machines_payload_check,
  ADD CONSTRAINT chk_production_line_machine_payload
    CHECK (is_valid_production_line_machine(payload));
