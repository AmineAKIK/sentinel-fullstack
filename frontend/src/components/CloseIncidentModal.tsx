import TextConfirmModal from './TextConfirmModal';
import { WorkshopIncident } from '../types';
import { useFieldLimits } from '../routes/FieldLimitsContext';
import { WORKSHOP_MUTATION_KEYS } from '../utils/workshopMutationKeys';

interface CloseIncidentModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}

export default function CloseIncidentModal({
  incident,
  onClose,
  onConfirm,
}: CloseIncidentModalProps) {
  const FIELD_LIMITS = useFieldLimits();
  return (
    <TextConfirmModal
      title="Clôturer l'incident"
      notice={
        <>
          Vous allez clôturer l'incident {incident.line_number} · {incident.machine_id}. Cette
          clôture est définitive. L’incident sera conservé dans l’historique.
        </>
      }
      label="Compte rendu / intervention *"
      placeholder="Décrivez l'intervention réalisée"
      confirmLabel="Clôturer"
      loadingLabel="Clôture…"
      mutationKey={WORKSHOP_MUTATION_KEYS.CLOSE}
      requiredMessage="Merci de renseigner le compte rendu."
      failureMessage="Impossible de clôturer l'incident."
      textareaId="closeNote"
      maxLength={FIELD_LIMITS.NOTE}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
