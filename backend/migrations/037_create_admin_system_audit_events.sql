-- Table de traçabilité des actions système de l'administrateur.
--
-- Les tables account_audit_events et line_audit_events couvrent les mutations
-- sur le référentiel (utilisateurs, lignes). Mais les actions sur les
-- paramètres de l'application (mot de passe admin, code board, settings app,
-- préférences notif, révocations de sessions) n'étaient pas tracées du tout.
-- Cette table comble ce manque.

CREATE TABLE IF NOT EXISTS admin_system_audit_events (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER REFERENCES admin_accounts(id),
  event_type  VARCHAR NOT NULL,
  changes     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_system_audit_events_created
  ON admin_system_audit_events (created_at DESC);
