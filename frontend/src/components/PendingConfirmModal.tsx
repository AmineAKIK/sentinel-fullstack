import { useState } from 'react';
import Modal from './Modal';
import { WorkshopIncident } from '../types';

interface PendingConfirmModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function PendingConfirmModal({ incident, onClose, onConfirm }: PendingConfirmModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Merci de renseigner la justification.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError("Impossible de mettre l'incident en attente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Mettre en attente"
      onClose={loading ? undefined : onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Confirmation…' : 'Confirmer'}
          </button>
        </>
      }
    >
      <div className="notice">
        Vous allez mettre en attente l'incident {incident.line_number} · {incident.machine_id}.
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="pendingReason">Justification *</label>
        <textarea
          id="pendingReason"
          className="form-input"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={loading}
          placeholder="Expliquez la raison de la mise en attente"
        />
      </div>
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
