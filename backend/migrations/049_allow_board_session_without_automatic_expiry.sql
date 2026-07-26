-- Session Board sans expiration automatique (RC3, lot 3).
--
-- La contrainte historique (migration 041) imposait
-- board_session_ttl_hours BETWEEN 1 AND 168, ce qui rendait impossible le
-- marqueur interne 0 = « sans expiration automatique ». On assouplit UNIQUEMENT
-- cette borne pour autoriser explicitement la valeur 0, tout en conservant la
-- plage 1..168 pour les durées normales. Aucune autre contrainte n'est touchée
-- et la migration 041 reste inchangée (append-only).
--
-- Sémantique : 0 signifie « la session reste active tant que le navigateur
-- conserve sa session ; elle peut être révoquée immédiatement via
-- board_session_version ». Le service d'authentification traduit 0 en
-- 'unlimited' pour le JWT et le cookie.

ALTER TABLE admin_accounts
  DROP CONSTRAINT IF EXISTS chk_board_session_duration,
  ADD CONSTRAINT chk_board_session_duration
    CHECK (board_session_ttl_hours = 0 OR board_session_ttl_hours BETWEEN 1 AND 168);

COMMENT ON COLUMN admin_accounts.board_session_ttl_hours IS
  'Durée de vie de la session Board en heures (1..168). La valeur 0 est un marqueur interne « sans expiration automatique » : le service traduit 0 en session JWT/cookie sans expiration, révocable via board_session_version.';
