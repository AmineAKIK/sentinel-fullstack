import { useMemo } from 'react';
import Modal from './Modal';
import { ProductionLine, WorkshopIncident } from '../types';
import { SHIFT_LABELS, STATE_LABELS } from '../utils/labels';
import { computeIncidentDiff } from '../utils/incidentDiff';

interface ReviewIncidentRequestModalProps {
  incident: WorkshopIncident;
  lines: ProductionLine[];
  type: 'edit' | 'delete';
  loading: boolean;
  error: string;
  allowDeleteApproval?: boolean;
  allowDeleteReject?: boolean;
  deleteApprovalDisabled?: boolean;
  deleteWarning?: string;
  allowEditApply?: boolean;
  allowEditReject?: boolean;
  editDisabled?: boolean;
  editWarning?: string;
  onClose: () => void;
  onApplyEdit?: () => void;
  onRejectEdit?: () => void;
  onApproveDelete?: () => void;
  onRejectDelete?: () => void;
}

export default function ReviewIncidentRequestModal({
  incident,
  lines,
  type,
  loading,
  error,
  allowDeleteApproval = true,
  allowDeleteReject = true,
  deleteApprovalDisabled = false,
  deleteWarning,
  allowEditApply = true,
  allowEditReject = true,
  editDisabled = false,
  editWarning,
  onClose,
  onApplyEdit,
  onRejectEdit,
  onApproveDelete,
  onRejectDelete,
}: ReviewIncidentRequestModalProps) {
  const requested = useMemo(() => {
    if (!incident.edit_request || typeof incident.edit_request !== 'object') return null;
    return incident.edit_request;
  }, [incident.edit_request]);

  const changeRows = useMemo(
    () => (requested ? computeIncidentDiff(incident, requested, lines) : []),
    [incident, lines, requested]
  );

  const footer = type === 'edit' ? (
    <>
      {allowEditReject && (
        <button className="btn btn-secondary" onClick={onRejectEdit} disabled={loading || editDisabled}>
          Refuser
        </button>
      )}
      {allowEditApply && (
        <button className="btn btn-primary" onClick={onApplyEdit} disabled={loading || editDisabled}>
          {loading ? 'Application…' : 'Appliquer'}
        </button>
      )}
    </>
  ) : (
    <>
      {allowDeleteReject && (
        <button className="btn btn-secondary" onClick={onRejectDelete} disabled={loading}>
          Refuser
        </button>
      )}
      {allowDeleteApproval && (
        <button
          className="btn btn-danger"
          onClick={onApproveDelete}
          disabled={loading || deleteApprovalDisabled}
        >
          {loading ? 'Annulation…' : "Annuler l'incident"}
        </button>
      )}
    </>
  );

  return (
    <Modal
      title={type === 'edit' ? 'Demande de modification' : 'Demande d’annulation'}
      onClose={loading ? undefined : onClose}
      closeOnOverlay={false}
      isLoading={loading}
      variant={type === 'delete' ? 'danger' : 'default'}
      size="lg"
      footer={footer}
    >
      <div className="detail-grid">
        <div className="detail-field">
          <span className="detail-field-label">Incident</span>
          <span className="detail-field-value">
            {incident.line_number} · {incident.machine_id}
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Utilisateur</span>
          <span className="detail-field-value">
            {incident.first_name} {incident.last_name}
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Équipe</span>
          <span className="detail-field-value">{SHIFT_LABELS[incident.shift]}</span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">État</span>
          <span className="detail-field-value">{STATE_LABELS[incident.state]}</span>
        </div>
      </div>

      {type === 'delete' && (
        <>
          <div className="notice">
            <strong>Motif :</strong> {incident.cancel_request_reason || 'Non renseigné'}
          </div>
          {deleteWarning && (
            <div className="notice" style={{ marginTop: 12 }}>{deleteWarning}</div>
          )}
          {deleteApprovalDisabled && (
            <div className="notice" style={{ marginTop: 12 }}>
              Annulation impossible après prise en charge.
            </div>
          )}
        </>
      )}

      {type === 'edit' && editWarning && (
        <div className="notice" style={{ marginTop: 12 }}>{editWarning}</div>
      )}

      {type === 'edit' && (
        <div className="table-wrapper">
          <table className="change-table">
            <tbody>
              {changeRows.length === 0 ? (
                <tr>
                  <td colSpan={3}>Aucune modification détectée.</td>
                </tr>
              ) : (
                changeRows.map((row) => (
                  <tr key={row.label}>
                    <td><strong>{row.label}</strong></td>
                    <td>{row.current}</td>
                    <td>{row.requested}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
