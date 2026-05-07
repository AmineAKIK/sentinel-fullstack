import { useState } from 'react';
import Modal from './Modal';
import { WorkshopIncident } from '../types';

interface CloseIncidentModalProps {
  incident: WorkshopIncident;
  onClose: () => void;
  onConfirm: (note: string) => Promise<void>;
}

export default function CloseIncidentModal({ incident, onClose, onConfirm }: CloseIncidentModalProps) {
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    const trimmed = note.trim();
    if (!trimmed) {
      setError('Merci de renseigner le compte rendu.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onConfirm(trimmed);
    } catch (err) {
      setError("Impossible de clôturer l'incident.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Clôturer l'incident"
      onClose={loading ? undefined : onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Clôture…' : 'Confirmer'}
          </button>
        </>
      }
    >
      <div className="notice">
        Vous allez clôturer l'incident {incident.line_number} · {incident.machine_id}.
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="closeNote">Compte rendu / intervention *</label>
        <textarea
          id="closeNote"
          className="form-input"
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={loading}
          placeholder="Décrivez l'intervention réalisée"
        />
      </div>
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
