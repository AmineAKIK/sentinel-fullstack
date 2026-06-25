-- Complète le snapshot d'identité pour les incidents atelier.
--
-- Migration 026 avait corrigé le déclarant et l'acteur des événements (nom+rôle).
-- Deux trous restaient :
--   1. Le technicien qui prend un incident en charge (taken_by_*) n'était pas
--      snapshoté — sa suppression réécrivait rétroactivement tous ses incidents.
--   2. Le badge de l'acteur dans workshop_incident_events n'était pas snapshoté —
--      le frontend typé attend badge_number, il revenait NULL.

-- ── 1. Snapshot du technicien dans workshop_incidents ───────────────────────

ALTER TABLE workshop_incidents
  ADD COLUMN IF NOT EXISTS taken_by_first_name  VARCHAR,
  ADD COLUMN IF NOT EXISTS taken_by_last_name   VARCHAR,
  ADD COLUMN IF NOT EXISTS taken_by_role        VARCHAR;

UPDATE workshop_incidents wi
SET taken_by_first_name = su.first_name,
    taken_by_last_name  = su.last_name,
    taken_by_role       = su.role
FROM sentinel_users su
WHERE su.id = wi.taken_by_user_id
  AND wi.taken_by_first_name IS NULL;

-- ── 2. Badge de l'acteur dans workshop_incident_events ──────────────────────

ALTER TABLE workshop_incident_events
  ADD COLUMN IF NOT EXISTS actor_badge_number  VARCHAR;

UPDATE workshop_incident_events we
SET actor_badge_number = su.badge_number
FROM sentinel_users su
WHERE su.id = we.actor_user_id
  AND we.actor_badge_number IS NULL;
