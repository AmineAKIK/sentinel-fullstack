import TextConfirmModal from './TextConfirmModal';
import { WorkshopIncident } from '../types';

interface DeleteRequestModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function DeleteRequestModal({
  incident,
  onClose,
  onConfirm,
}: DeleteRequestModalProps) {
  return (
    <TextConfirmModal
      title="Demande d’annulation"
      variant="danger"
      notice={
        <>
          Vous demandez l’annulation de l’incident {incident.line_number} · {incident.machine_id}.
          L’incident restera tracé dans l’historique.
        </>
      }
      label="Motif d’annulation *"
      placeholder="Erreur de saisie, doublon, mauvais équipement..."
      confirmLabel="Envoyer la demande"
      loadingLabel="Envoi…"
      requiredMessage="Merci de renseigner le motif d’annulation."
      failureMessage="Impossible d'envoyer la demande d’annulation."
      textareaId="deleteRequestReason"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
