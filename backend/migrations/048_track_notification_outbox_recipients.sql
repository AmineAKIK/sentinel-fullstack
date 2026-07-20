ALTER TABLE notification_outbox
  ADD COLUMN delivered_recipients JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN notification_outbox.delivered_recipients IS
  'Map canal -> liste des adresses déjà confirmées livrées, pour ne jamais rejouer un destinataire déjà servi lors d''une reprise partielle (DR-13).';
