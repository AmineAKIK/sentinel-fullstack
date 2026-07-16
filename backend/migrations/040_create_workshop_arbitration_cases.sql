CREATE TABLE IF NOT EXISTS workshop_arbitration_cases (
  id BIGSERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES workshop_incidents(id) ON DELETE RESTRICT,
  request_event_id INTEGER UNIQUE REFERENCES workshop_incident_events(id) ON DELETE RESTRICT,
  request_type VARCHAR NOT NULL CHECK (request_type IN ('EDIT', 'CANCEL')),
  status VARCHAR NOT NULL CHECK (
    status IN ('ACTIVE', 'CONSULTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED')
  ),
  payload JSONB,
  reason TEXT,
  requested_by_user_id INTEGER NOT NULL REFERENCES sentinel_users(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL,
  consulted_by_user_id INTEGER REFERENCES sentinel_users(id) ON DELETE RESTRICT,
  consulted_at TIMESTAMPTZ,
  decided_by_user_id INTEGER REFERENCES sentinel_users(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ,
  decision_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_workshop_arbitration_case_state CHECK (
    (status = 'ACTIVE' AND consulted_by_user_id IS NULL AND consulted_at IS NULL AND decided_at IS NULL)
    OR (status = 'CONSULTED' AND consulted_by_user_id IS NOT NULL AND consulted_at IS NOT NULL AND decided_at IS NULL)
    OR (status IN ('APPROVED', 'REJECTED', 'WITHDRAWN', 'SUPERSEDED') AND decided_at IS NOT NULL)
  ),
  CONSTRAINT chk_workshop_arbitration_case_content CHECK (
    (request_type = 'EDIT' AND payload IS NOT NULL AND jsonb_typeof(payload) = 'object')
    OR (request_type = 'CANCEL' AND reason IS NOT NULL AND btrim(reason) <> '')
  )
);

WITH candidates AS (
  SELECT wi.id AS incident_id,
         wi.status AS incident_status,
         'EDIT'::varchar AS request_type,
         request_event.id AS request_event_id,
         COALESCE(request_event.actor_user_id, wi.user_id) AS requested_by_user_id,
         COALESCE(request_event.created_at, wi.updated_at) AS requested_at,
         wi.edit_request AS payload,
         NULL::text AS reason,
         consultation.consulted_by_user_id,
         consultation.consulted_at
  FROM workshop_incidents wi
  LEFT JOIN LATERAL (
    SELECT we.id, we.actor_user_id, we.created_at
    FROM workshop_incident_events we
    WHERE we.incident_id = wi.id AND we.event_type = 'EDIT_REQUESTED'
    ORDER BY we.id DESC
    LIMIT 1
  ) request_event ON TRUE
  LEFT JOIN workshop_arbitration_consultations consultation
    ON consultation.request_event_id = request_event.id
  WHERE wi.edit_request IS NOT NULL

  UNION ALL

  SELECT wi.id,
         wi.status,
         'CANCEL'::varchar,
         request_event.id,
         COALESCE(request_event.actor_user_id, wi.user_id),
         COALESCE(request_event.created_at, wi.updated_at),
         NULL::jsonb,
         COALESCE(NULLIF(btrim(wi.cancel_request_reason), ''), 'Motif historique non renseigné'),
         consultation.consulted_by_user_id,
         consultation.consulted_at
  FROM workshop_incidents wi
  LEFT JOIN LATERAL (
    SELECT we.id, we.actor_user_id, we.created_at
    FROM workshop_incident_events we
    WHERE we.incident_id = wi.id AND we.event_type = 'CANCEL_REQUESTED'
    ORDER BY we.id DESC
    LIMIT 1
  ) request_event ON TRUE
  LEFT JOIN workshop_arbitration_consultations consultation
    ON consultation.request_event_id = request_event.id
  WHERE wi.cancel_request = TRUE
), ranked AS (
  SELECT candidates.*,
         ROW_NUMBER() OVER (
           PARTITION BY incident_id
           ORDER BY requested_at DESC, request_event_id DESC NULLS LAST, request_type DESC
         ) AS request_rank
  FROM candidates
)
INSERT INTO workshop_arbitration_cases (
  incident_id, request_event_id, request_type, status, payload, reason,
  requested_by_user_id, requested_at, consulted_by_user_id, consulted_at,
  decided_at, decision_reason
)
SELECT incident_id,
       request_event_id,
       request_type,
       CASE
         WHEN incident_status NOT IN ('OPEN', 'PENDING') OR request_rank > 1 THEN 'SUPERSEDED'
         WHEN consulted_at IS NOT NULL THEN 'CONSULTED'
         ELSE 'ACTIVE'
       END,
       payload,
       reason,
       requested_by_user_id,
       requested_at,
       CASE WHEN incident_status IN ('OPEN', 'PENDING') AND request_rank = 1 THEN consulted_by_user_id END,
       CASE WHEN incident_status IN ('OPEN', 'PENDING') AND request_rank = 1 THEN consulted_at END,
       CASE WHEN incident_status NOT IN ('OPEN', 'PENDING') OR request_rank > 1 THEN NOW() END,
       CASE
         WHEN incident_status NOT IN ('OPEN', 'PENDING') THEN 'Cas historique rattaché à un incident terminal'
         WHEN request_rank > 1 THEN 'Cas historique supersédé lors de la normalisation'
       END
FROM ranked
ON CONFLICT (request_event_id) DO NOTHING;

-- Keep exactly one compatibility flag aligned with the normalized open case.
UPDATE workshop_incidents wi
SET edit_request = NULL
WHERE wi.edit_request IS NOT NULL
  AND wi.cancel_request = TRUE
  AND EXISTS (
    SELECT 1 FROM workshop_arbitration_cases wac
    WHERE wac.incident_id = wi.id
      AND wac.request_type = 'CANCEL'
      AND wac.status IN ('ACTIVE', 'CONSULTED')
  );

UPDATE workshop_incidents wi
SET cancel_request = FALSE,
    cancel_request_reason = NULL,
    delete_request = FALSE,
    delete_request_reason = NULL
WHERE wi.cancel_request = TRUE
  AND wi.edit_request IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM workshop_arbitration_cases wac
    WHERE wac.incident_id = wi.id
      AND wac.request_type = 'EDIT'
      AND wac.status IN ('ACTIVE', 'CONSULTED')
  );

UPDATE workshop_incidents
SET edit_request = NULL,
    cancel_request = FALSE,
    cancel_request_reason = NULL,
    delete_request = FALSE,
    delete_request_reason = NULL
WHERE status NOT IN ('OPEN', 'PENDING');

CREATE UNIQUE INDEX IF NOT EXISTS idx_workshop_arbitration_one_open_case
  ON workshop_arbitration_cases (incident_id)
  WHERE status IN ('ACTIVE', 'CONSULTED');

CREATE INDEX IF NOT EXISTS idx_workshop_arbitration_queue
  ON workshop_arbitration_cases (status, requested_at, incident_id);

ALTER TABLE workshop_incidents
  ADD CONSTRAINT chk_incident_single_legacy_arbitration
    CHECK (NOT (edit_request IS NOT NULL AND cancel_request = TRUE)),
  ADD CONSTRAINT chk_incident_cancel_request_reason
    CHECK (
      (cancel_request = TRUE AND cancel_request_reason IS NOT NULL AND btrim(cancel_request_reason) <> '')
      OR (cancel_request = FALSE AND cancel_request_reason IS NULL)
    ),
  ADD CONSTRAINT chk_terminal_incident_has_no_arbitration
    CHECK (
      status IN ('OPEN', 'PENDING')
      OR (edit_request IS NULL AND cancel_request = FALSE AND cancel_request_reason IS NULL)
    );
