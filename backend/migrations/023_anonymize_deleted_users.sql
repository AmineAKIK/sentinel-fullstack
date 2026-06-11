-- RGPD : anonymisation des données personnelles des comptes supprimés.
-- Les suppressions effectuées avant cette migration conservaient nom, prénom,
-- badge et credentials. On les anonymise rétroactivement ; les suppressions
-- futures anonymisent directement (voir accounts.repository.softDeleteAccount).
-- L'id est conservé : il garantit l'intégrité référentielle des incidents et
-- de l'audit trail sans identifier la personne (pseudonymisation).

UPDATE sentinel_users
SET first_name = 'Utilisateur',
    last_name = 'Supprimé',
    badge_number = 'ANON-' || id,
    password_hash = NULL,
    password_setup_token_hash = NULL,
    password_setup_expires_at = NULL,
    updated_at = NOW()
WHERE is_deleted = TRUE
  AND badge_number NOT LIKE 'ANON-%';
