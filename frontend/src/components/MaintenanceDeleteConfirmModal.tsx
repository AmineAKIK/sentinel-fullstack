import ConfirmModal from './ConfirmModal';
import { WorkshopIncident } from '../types';
import { WORKSHOP_MUTATION_KEYS } from '../utils/workshopMutationKeys';

interface MaintenanceDeleteConfirmModalProps {
  incident: WorkshopIncident;
  title: string;
  message?: string;
  error?: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export default function MaintenanceDeleteConfirmModal({
  incident,
  title,
  message,
  error = '',
  loading = false,
  onClose,
  onConfirm,
}: MaintenanceDeleteConfirmModalProps) {
  return (
    <ConfirmModal
      title={title}
      mutationKey={WORKSHOP_MUTATION_KEYS.DIRECT_CANCEL}
      onClose={onClose}
      onConfirm={onConfirm}
      confirmLabel="Confirmer l’annulation"
      loadingLabel="Annulation…"
      variant="danger"
      loading={loading}
      error={error}
      failureMessage="Impossible d’annuler l’incident."
    >
      <div className="notice">
        <strong>Cette annulation est définitive.</strong>{' '}
        {message ||
          'Cette action annule l’incident et le conserve dans l’historique. Confirmez uniquement s’il s’agit d’une erreur ou d’un doublon.'}
      </div>
      <div className="detail-grid" style={{ marginTop: 12 }}>
        <div className="detail-field">
          <span className="detail-field-label">Incident</span>
          <span className="detail-field-value">
            {incident.line_number} · {incident.machine_id}
          </span>
        </div>
      </div>
    </ConfirmModal>
  );
}
