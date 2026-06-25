-- Fige l'identité des acteurs dans les incidents et leurs événements.
--
-- Problème : workshop_incidents et workshop_incident_events résolvaient le
-- nom du déclarant / technicien / acteur via une jointure live sur
-- sentinel_users. Quand un utilisateur est supprimé (anonymisé en
-- « Utilisateur Supprimé / ANON-<id> », cf. migration 023), TOUS ses
-- incidents passés affichaient rétroactivement ce pseudonyme — un historique
-- d'atelier doit être immuable, comme un journal d'audit.
--
-- Solution : on capture le nom/prénom/rôle AU MOMENT de la création
-- de chaque enregistrement. Même approche que la migration 025 côté audit.

-- ── 1. Snapshot du déclarant dans workshop_incidents ────────────────────────

ALTER TABLE workshop_incidents
  ADD COLUMN IF NOT EXISTS declarant_first_name  VARCHAR,
  ADD COLUMN IF NOT EXISTS declarant_last_name   VARCHAR,
  ADD COLUMN IF NOT EXISTS declarant_role        VARCHAR;

-- Backfill depuis l'état courant. Les comptes déjà anonymisés récupèrent
-- la valeur ANON — on ne peut pas reconstituer l'identité passée, mais
-- à partir de maintenant chaque nouvel incident figera la bonne identité.
UPDATE workshop_incidents wi
SET declarant_first_name = su.first_name,
    declarant_last_name  = su.last_name,
    declarant_role       = su.role
FROM sentinel_users su
WHERE su.id = wi.user_id
  AND wi.declarant_first_name IS NULL;

-- ── 2. Snapshot de l'acteur dans workshop_incident_events ───────────────────

ALTER TABLE workshop_incident_events
  ADD COLUMN IF NOT EXISTS actor_first_name  VARCHAR,
  ADD COLUMN IF NOT EXISTS actor_last_name   VARCHAR,
  ADD COLUMN IF NOT EXISTS actor_role        VARCHAR;

UPDATE workshop_incident_events we
SET actor_first_name = su.first_name,
    actor_last_name  = su.last_name,
    actor_role       = su.role
FROM sentinel_users su
WHERE su.id = we.actor_user_id
  AND we.actor_first_name IS NULL;
