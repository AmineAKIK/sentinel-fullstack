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
      setError('Merci de renseigner le motif d’annulation.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError("Impossible d'envoyer la demande d’annulation.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Demande d’annulation"
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
            {loading ? 'Envoi…' : 'Envoyer la demande'}
          </button>
        </>
      }
    >
      <div className="notice">
        Vous demandez l’annulation de l'incident {incident.line_number} · {incident.machine_id}. Le signalement restera tracé dans l’historique.
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="deleteRequestReason">Motif d’annulation *</label>
        <textarea
          id="deleteRequestReason"
          className="form-input"
          rows={4}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={loading}
          placeholder="Erreur de signalement, doublon, mauvais équipement..."
        />
      </div>
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
