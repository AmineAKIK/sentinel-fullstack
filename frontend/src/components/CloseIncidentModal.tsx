import TextConfirmModal from './TextConfirmModal';
import { WorkshopIncident } from '../types';

interface CloseIncidentModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}

export default function CloseIncidentModal({ incident, onClose, onConfirm }: CloseIncidentModalProps) {
  return (
    <TextConfirmModal
      title="Clôturer l'incident"
      notice={<>Vous allez clôturer l'incident {incident.line_number} · {incident.machine_id}.</>}
      label="Compte rendu / intervention *"
      placeholder="Décrivez l'intervention réalisée"
      confirmLabel="Clôturer"
      loadingLabel="Clôture…"
      requiredMessage="Merci de renseigner le compte rendu."
      failureMessage="Impossible de clôturer l'incident."
      textareaId="closeNote"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
