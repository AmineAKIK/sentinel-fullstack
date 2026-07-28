import TextConfirmModal from './TextConfirmModal';
import { WorkshopIncident } from '../types';
import { WORKSHOP_MUTATION_KEYS } from '../utils/workshopMutationKeys';

interface InvalidateIncidentModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function InvalidateIncidentModal({
  incident,
  onClose,
  onConfirm,
}: InvalidateIncidentModalProps) {
  return (
    <TextConfirmModal
      title="Invalider l’incident clôturé"
      variant="danger"
      notice={
        <>
          L’incident {incident.line_number} · {incident.machine_id} restera dans le journal, mais il
          sera exclu des statistiques et de la base de connaissance. Cette invalidation est
          définitive.
        </>
      }
      label="Motif d’invalidation *"
      placeholder="Doublon, erreur de saisie, clôture non exploitable..."
      confirmLabel="Confirmer l’invalidation"
      loadingLabel="Invalidation…"
      mutationKey={WORKSHOP_MUTATION_KEYS.INVALIDATE}
      requiredMessage="Merci de renseigner le motif d’invalidation."
      failureMessage="Impossible d’invalider l’incident."
      textareaId="invalidateReason"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
