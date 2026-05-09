import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../routes/AuthContext';
import Modal from './Modal';
import { deleteLine, getLineImpact } from '../api/lines';
import { verifyAdminPassword } from '../api/auth';
import { ApiResponseError } from '../api/client';
import { ProductionLine } from '../types';

interface DeleteLineConfirmModalProps {
  line: ProductionLine;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeleteLineConfirmModal({
  line,
  onClose,
  onSuccess,
}: DeleteLineConfirmModalProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(false);
  const [impact, setImpact] = useState<{ incidents: number; open_or_pending_incidents: number } | null>(null);

  useEffect(() => {
    getLineImpact(line.id).then(setImpact).catch(() => setImpact(null));
  }, [line.id]);

  const hasActiveIncidents = Boolean(impact && impact.open_or_pending_incidents > 0);

  async function handleConfirm() {
    setError('');
    setPasswordError('');

    if (!password.trim()) {
      setPasswordError('Mot de passe administrateur requis.');
      return;
    }

    setLoading(true);
    try {
      await verifyAdminPassword(password);
      await deleteLine(line.id);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiResponseError) {
        if (err.code === 'UNAUTHORIZED') {
          if (err.message === 'Session expirée.') {
            await logout();
            navigate('/admin/login', {
              replace: true,
              state: { reason: 'Session expirée après 3 tentatives de mot de passe incorrect.' },
            });
            return;
          }
          setPasswordError('Mot de passe incorrect.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Une erreur inattendue est survenue.');
      }
      setLoading(false);
    }
  }

  return (
    <Modal
      title="Supprimer la ligne"
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      isLoading={loading}
      variant="danger"
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Annuler
          </button>
          <button className="btn btn-danger" onClick={handleConfirm} disabled={loading || hasActiveIncidents}>
            {loading ? <><span className="spinner" /> Suppression…</> : 'Confirmer'}
          </button>
        </>
      }
    >
      <p style={{ fontWeight: 500, marginBottom: 8 }}>
        Supprimer la ligne {line.line_number} ?
      </p>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
        Cette action retirera la ligne de la gestion courante. Sa configuration ne sera plus visible dans la liste.
      </p>
      {impact && impact.incidents > 0 && (
        <div className="notice">
          Impact historique : {impact.incidents} incident(s) lié(s), dont {impact.open_or_pending_incidents} actif(s).
          {hasActiveIncidents && (
            <> Suppression bloquée tant que ces incidents ne sont pas clôturés ou annulés.</>
          )}
        </div>
      )}
      <div className="form-group" style={{ marginTop: 16 }}>
        <label className="form-label" htmlFor="adminPassword">Mot de passe administrateur</label>
        <input
          id="adminPassword"
          className="form-input"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          autoComplete="current-password"
        />
        {passwordError && <div className="field-error">{passwordError}</div>}
      </div>
      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
