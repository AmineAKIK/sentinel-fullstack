import { useState } from 'react';
import Modal from './Modal';
import { WorkshopIncident } from '../types';

interface DeleteRequestModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}

export default function DeleteRequestModal({ incident, onClose, onConfirm }: DeleteRequestModalProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Merci de renseigner le motif de suppression.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError("Impossible d'envoyer la demande de suppression.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Demande de suppression"
      onClose={loading ? undefined : onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </>
      }
    >
      <div className="notice">
        Vous demandez la suppression de l'incident {incident.line_number} · {incident.machine_id}.
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="deleteRequestReason">Motif de suppression *</label>
        <textarea
          id="deleteRequestReason"
          className="form-input"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={loading}
          placeholder="Expliquez la raison de la suppression"
        />
      </div>
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
