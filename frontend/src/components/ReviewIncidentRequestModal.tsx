import { useMemo } from 'react';
import Modal from './Modal';
import { ProductionLine, WorkshopIncident } from '../types';
import { ROLE_LABELS, STATE_LABELS } from '../utils/labels';
import { computeIncidentDiff } from '../utils/incidentDiff';
import { formatDateTime } from '../utils/date';

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
  onConsult?: () => void;
  onReport?: () => void;
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
  onConsult,
  onReport,
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
  const creatorName = `${incident.first_name} ${incident.last_name}`.trim();
  const takenByName = incident.taken_by_first_name
    ? `${incident.taken_by_first_name} ${incident.taken_by_last_name ?? ''}`.trim()
    : '';
  const currentProduct = incident.current_product?.trim();
  const editState = incident.arbitration?.edit?.state;
  const cancelState = incident.arbitration?.cancel?.state;
  const activeRequestCount =
    Number(Boolean(incident.edit_request)) + Number(Boolean(incident.cancel_request));
  const hasActiveArbitration =
    (Boolean(incident.edit_request) && editState !== 'WAITING') ||
    (Boolean(incident.cancel_request) && cancelState !== 'WAITING');
  const requestDate =
    type === 'edit'
      ? incident.arbitration?.edit?.requestedAt
      : incident.arbitration?.cancel?.requestedAt;
  const machineContextQuery = `line=${incident.line_id}&machine=${encodeURIComponent(incident.machine_id)}`;
  const report = onReport ?? onClose;

  const footer = type === 'edit' ? (
    <>
      <button className="btn btn-secondary" onClick={report} disabled={loading}>
        Reporter
      </button>
      {onConsult && hasActiveArbitration && (
        <button className="btn btn-outline" onClick={onConsult} disabled={loading}>
          Consulter le dossier
        </button>
      )}
      <span className="arbitration-modal-footer-spacer" aria-hidden="true" />
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
      <button className="btn btn-secondary" onClick={report} disabled={loading}>
        Reporter
      </button>
      {onConsult && hasActiveArbitration && (
        <button className="btn btn-outline" onClick={onConsult} disabled={loading}>
          Consulter le dossier
        </button>
      )}
      <span className="arbitration-modal-footer-spacer" aria-hidden="true" />
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
      onClose={loading ? undefined : report}
      closeOnOverlay={false}
      isLoading={loading}
      variant={type === 'delete' ? 'danger' : 'default'}
      size="lg"
      footer={footer}
    >
      <div className="arbitration-modal-brief">
        <div>
          <span className="detail-field-label">Décision attendue</span>
          <strong>
            {type === 'edit' ? 'Correction opérateur' : 'Annulation opérateur'}
          </strong>
        </div>
        {activeRequestCount > 1 && (
          <div className="notice arbitration-modal-secondary-notice">
            Deux demandes sont actives sur cet incident. Vérifier les deux avant décision finale.
          </div>
        )}
      </div>

      <div className="detail-grid">
        <div className="detail-field">
          <span className="detail-field-label">Incident</span>
          <span className="detail-field-value">
            {incident.line_number} · {incident.machine_id}
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Demandeur</span>
          <span className="detail-field-value">
            {creatorName || 'Non renseigné'}
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Rôle demandeur</span>
          <span className="detail-field-value">{ROLE_LABELS[incident.role] ?? incident.role}</span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Date de demande</span>
          <span className="detail-field-value">
            {requestDate ? formatDateTime(requestDate) : 'Non tracée'}
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">État</span>
          <span className="detail-field-value">{STATE_LABELS[incident.state]}</span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Produit</span>
          <span className="detail-field-value">
            {currentProduct || <span className="detail-value-muted">Non renseigné</span>}
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Robot</span>
          <span className="detail-field-value">
            {incident.robot_label} · Tête {incident.head_number}
          </span>
        </div>
        <div className="detail-field">
          <span className="detail-field-label">Prise en charge</span>
          <span className="detail-field-value">
            {takenByName
              ? `${takenByName}${
                  incident.taken_by_role
                    ? ` · ${ROLE_LABELS[incident.taken_by_role] ?? incident.taken_by_role}`
                    : ''
                }`
              : 'Non pris'}
          </span>
        </div>
      </div>

      <div className="arbitration-modal-state-row" aria-label="État des demandes d'arbitrage">
        {incident.edit_request && (
          <span
            className={`incident-detail-request incident-detail-request--edit${
              editState === 'WAITING' ? ' is-waiting' : ''
            }`}
          >
            Correction {editState === 'WAITING' ? 'en attente' : 'active'}
          </span>
        )}
        {incident.cancel_request && (
          <span
            className={`incident-detail-request incident-detail-request--delete${
              cancelState === 'WAITING' ? ' is-waiting' : ''
            }`}
          >
            Annulation {cancelState === 'WAITING' ? 'en attente' : 'active'}
          </span>
        )}
      </div>

      <div className="machine-context-actions">
        <a className="btn btn-outline btn-sm" href={`/workshop/knowledge?${machineContextQuery}`}>
          Solutions déjà appliquées
        </a>
        <a className="btn btn-outline btn-sm" href={`/workshop/history?${machineContextQuery}`}>
          Historique de la machine
        </a>
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
            <thead>
              <tr>
                <th>Champ</th>
                <th>Actuel</th>
                <th>Demandé</th>
              </tr>
            </thead>
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

      {(incident.comment || incident.diagnostic || incident.intervention_note || incident.responsible_comment) && (
        <div className="arbitration-modal-context">
          {incident.comment && (
            <div className="incident-detail-note">
              <span className="detail-field-label">Signalement</span>
              <p>{incident.comment}</p>
            </div>
          )}
          {incident.diagnostic && (
            <div className="incident-detail-note">
              <span className="detail-field-label">Diagnostic</span>
              <p>{incident.diagnostic}</p>
            </div>
          )}
          {incident.intervention_note && (
            <div className="incident-detail-note">
              <span className="detail-field-label">Intervention</span>
              <p>{incident.intervention_note}</p>
            </div>
          )}
          {incident.responsible_comment && (
            <div className="incident-detail-note">
              <span className="detail-field-label">Consigne responsable</span>
              <p>{incident.responsible_comment}</p>
            </div>
          )}
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
    </Modal>
  );
}
