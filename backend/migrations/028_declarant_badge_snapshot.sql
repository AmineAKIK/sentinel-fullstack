-- Snapshot du badge du déclarant dans workshop_incidents.
--
-- Migrations 026 et 027 ont figé nom/prénom/rôle du déclarant et du
-- technicien, ainsi que le badge de l'acteur dans les événements.
-- Il manquait le badge du déclarant (l'opérateur qui ouvre l'incident).
-- Sans cette colonne le champ badge_number reste une jointure live et
-- devient ANON-<id> si l'utilisateur est anonymisé.

ALTER TABLE workshop_incidents
  ADD COLUMN IF NOT EXISTS declarant_badge_number VARCHAR;

UPDATE workshop_incidents wi
SET declarant_badge_number = su.badge_number
FROM sentinel_users su
WHERE su.id = wi.user_id
  AND wi.declarant_badge_number IS NULL;
