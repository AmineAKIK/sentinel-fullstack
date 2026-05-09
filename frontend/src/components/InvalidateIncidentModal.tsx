import { useState } from 'react';
import Modal from './Modal';
import { WorkshopIncident } from '../types';

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
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Merci de renseigner le motif d’invalidation.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onConfirm(trimmed);
    } catch {
      setError("Impossible d’invalider l’incident.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Invalider le cas clôturé"
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      isDirty={reason.trim().length > 0}
      isLoading={loading}
      variant="danger"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Invalidation…' : 'Confirmer l’invalidation'}
          </button>
        </>
      }
    >
      <div className="notice">
        Le cas {incident.line_number} · {incident.machine_id} restera dans le journal, mais il sera exclu des statistiques et de la base de connaissance.
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="invalidateReason">Motif d’invalidation *</label>
        <textarea
          id="invalidateReason"
          className="form-input"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={loading}
          placeholder="Doublon, erreur de signalement, clôture non exploitable..."
        />
      </div>
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
