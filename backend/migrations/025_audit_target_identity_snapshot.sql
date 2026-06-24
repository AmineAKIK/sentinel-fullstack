-- Fige l'identité de l'utilisateur cible dans chaque événement d'audit.
--
-- Problème : le journal affichait l'identité actuelle de la cible via une
-- jointure live sur sentinel_users. Quand un utilisateur est supprimé (et donc
-- anonymisé en « Utilisateur Supprimé / ANON-<id> », cf. migration 023), TOUT
-- son historique d'audit se réécrivait rétroactivement avec ce pseudonyme —
-- un journal d'audit doit pourtant être un enregistrement immuable de ce qui
-- s'est passé.
--
-- Solution : on capture le nom/prénom/badge AU MOMENT de l'événement.

-- 1. Colonnes de snapshot d'identité (nullable : les anciens events seront
--    backfillés, et un event peut viser un compte déjà supprimé).
ALTER TABLE account_audit_events
  ADD COLUMN IF NOT EXISTS target_first_name  VARCHAR,
  ADD COLUMN IF NOT EXISTS target_last_name   VARCHAR,
  ADD COLUMN IF NOT EXISTS target_badge_number VARCHAR;

-- 2. Backfill des events existants depuis l'état courant de sentinel_users.
--    Pour les comptes déjà anonymisés, on récupérera la valeur ANON — c'est le
--    passé qu'on ne peut pas reconstituer, mais à partir de maintenant chaque
--    nouvel event fige la bonne identité.
UPDATE account_audit_events ae
SET target_first_name  = su.first_name,
    target_last_name   = su.last_name,
    target_badge_number = su.badge_number
FROM sentinel_users su
WHERE su.id = ae.target_user_id
  AND ae.target_first_name IS NULL;
