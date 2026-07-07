import { useMemo, type ReactNode } from 'react';
import Modal from './Modal';
import { ProductionLine, WorkshopIncident } from '../types';
import { ROLE_LABELS, STATE_LABELS } from '../utils/labels';
import { computeIncidentDiff } from '../utils/incidentDiff';
import { formatDateTime, formatElapsed } from '../utils/date';

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

type ArbitrationRequestState = 'ACTIVE' | 'WAITING' | undefined;

function requestStateLabel(state: ArbitrationRequestState): string {
  return state === 'WAITING' ? 'Consultée' : 'À arbitrer';
}

function isRequestWaiting(state: ArbitrationRequestState): boolean {
  return state === 'WAITING';
}

function isRequestConsultable(hasRequest: boolean, state: ArbitrationRequestState): boolean {
  return hasRequest && !isRequestWaiting(state);
}

function DecisionField({
  label,
  children,
  emphasis = false,
}: {
  label: string;
  children: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className={`arbitration-field${emphasis ? ' arbitration-field--emphasis' : ''}`}>
      <span className="detail-field-label">{label}</span>
      <span className="detail-field-value">{children}</span>
    </div>
  );
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
  const hasEditRequest = Boolean(incident.edit_request);
  const hasCancelRequest = Boolean(incident.cancel_request);
  const requestCount = Number(hasEditRequest) + Number(hasCancelRequest);
  const editIsConsultable = isRequestConsultable(hasEditRequest, editState);
  const cancelIsConsultable = isRequestConsultable(hasCancelRequest, cancelState);
  const consultableRequestCount = Number(editIsConsultable) + Number(cancelIsConsultable);
  const hasConsultableArbitration = consultableRequestCount > 0;
  const consultLabel =
    consultableRequestCount > 1 || (type === 'edit' ? cancelIsConsultable : editIsConsultable)
      ? 'Consulter les demandes'
      : 'Consulter le dossier';
  const currentRequestState = type === 'edit' ? editState : cancelState;
  const currentRequestLabel = requestStateLabel(currentRequestState);
  const requestDate =
    type === 'edit'
      ? incident.arbitration?.edit?.requestedAt
      : incident.arbitration?.cancel?.requestedAt;
  const requestAge = requestDate ? formatElapsed(requestDate) : null;
  const requestDateLabel = requestDate ? formatDateTime(requestDate) : 'Non tracée';
  const report = onReport ?? onClose;
  const isDelete = type === 'delete';
  const decisionTitle = isDelete ? 'Annulation opérateur' : 'Correction opérateur';
  const modalTitle = isDelete ? 'Arbitrage annulation' : 'Arbitrage correction';
  const requesterRole = ROLE_LABELS[incident.role] ?? incident.role;
  const takenByLabel = takenByName
    ? `${takenByName}${
        incident.taken_by_role
          ? ` · ${ROLE_LABELS[incident.taken_by_role] ?? incident.taken_by_role}`
          : ''
      }`
    : 'Non pris';
  const priorityLabel = incident.is_priority ? 'Urgent' : 'Normal';
  const hasNarrativeContext =
    Boolean(incident.comment) ||
    Boolean(incident.diagnostic) ||
    Boolean(incident.intervention_note);

  const footer =
    type === 'edit' ? (
      <div className="arbitration-footer">
        <div className="arbitration-footer-group">
          <button className="btn btn-secondary" onClick={report} disabled={loading}>
            Reporter
          </button>
          {onConsult && hasConsultableArbitration && (
            <button className="btn btn-outline" onClick={onConsult} disabled={loading}>
              {consultLabel}
            </button>
          )}
        </div>
        <div className="arbitration-footer-group arbitration-footer-group--decision">
          {allowEditReject && (
            <button
              className="btn btn-secondary"
              onClick={onRejectEdit}
              disabled={loading || editDisabled}
            >
              Refuser la demande
            </button>
          )}
          {allowEditApply && (
            <button
              className="btn btn-primary"
              onClick={onApplyEdit}
              disabled={loading || editDisabled}
            >
              {loading ? 'Application…' : 'Appliquer la correction'}
            </button>
          )}
        </div>
      </div>
    ) : (
      <div className="arbitration-footer">
        <div className="arbitration-footer-group">
          <button className="btn btn-secondary" onClick={report} disabled={loading}>
            Reporter
          </button>
          {onConsult && hasConsultableArbitration && (
            <button className="btn btn-outline" onClick={onConsult} disabled={loading}>
              {consultLabel}
            </button>
          )}
        </div>
        <div className="arbitration-footer-group arbitration-footer-group--decision">
          {allowDeleteReject && (
            <button className="btn btn-secondary" onClick={onRejectDelete} disabled={loading}>
              Refuser la demande
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
        </div>
      </div>
    );

  return (
    <Modal
      title={modalTitle}
      onClose={loading ? undefined : report}
      closeOnOverlay={false}
      isLoading={loading}
      variant="default"
      size="lg"
      className="modal--arbitration"
      overlayClassName="modal-overlay--depth-focus"
      footer={footer}
    >
      <div
        className={`arbitration-modal-layout arbitration-modal-layout--${
          isDelete ? 'delete' : 'edit'
        }`}
      >
        <div className="arbitration-command-grid">
          <section
            className={`arbitration-decision-card arbitration-decision-card--${isDelete ? 'delete' : 'edit'}`}
          >
            <div className="arbitration-decision-head">
              <div>
                <span className="detail-field-label">Décision attendue</span>
                <h2>{decisionTitle}</h2>
              </div>
              <span
                className={`arbitration-state-pill arbitration-state-pill--${
                  isRequestWaiting(currentRequestState) ? 'waiting' : isDelete ? 'delete' : 'edit'
                }`}
              >
                {currentRequestLabel}
              </span>
            </div>
            <div className="arbitration-decision-meta">
              <DecisionField label="Demandeur" emphasis>
                {creatorName || 'Non renseigné'}
              </DecisionField>
              <DecisionField label="Rôle">{requesterRole}</DecisionField>
              <DecisionField label="Demande">{requestDateLabel}</DecisionField>
              <DecisionField label="Ancienneté">
                {requestAge && requestAge !== '—' ? requestAge : 'Non calculée'}
              </DecisionField>
            </div>
          </section>

          <section
            className={`arbitration-request-card arbitration-request-card--${
              isDelete ? 'delete' : 'edit'
            }`}
          >
            <div className="arbitration-section-head">
              <h3>{isDelete ? 'Demande d’annulation' : 'Correction demandée'}</h3>
            </div>

            {isDelete ? (
              <>
                <div className="arbitration-reason-card">
                  <span className="detail-field-label">Motif opérateur</span>
                  <p>{incident.cancel_request_reason || 'Non renseigné'}</p>
                </div>
                {deleteWarning && <div className="arbitration-system-note">{deleteWarning}</div>}
                {deleteApprovalDisabled && (
                  <div className="arbitration-system-note arbitration-system-note--danger">
                    Annulation impossible après prise en charge.
                  </div>
                )}
              </>
            ) : (
              <>
                {editWarning && <div className="arbitration-system-note">{editWarning}</div>}
                <div className="arbitration-diff-list">
                  {changeRows.length === 0 ? (
                    <div className="arbitration-empty-state">Aucune modification détectée.</div>
                  ) : (
                    changeRows.map((row) => (
                      <div className="arbitration-diff-row" key={row.label}>
                        <div className="arbitration-diff-field">{row.label}</div>
                        <div className="arbitration-diff-values">
                          <div>
                            <span className="detail-field-label">Actuel</span>
                            <p>{row.current}</p>
                          </div>
                          <div className="arbitration-diff-requested">
                            <span className="detail-field-label">Demandé</span>
                            <p>{row.requested}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <section className="arbitration-context-card">
          <div className="arbitration-context-head">
            <h3>Contexte incident</h3>
            <div
              className="arbitration-request-state-row"
              aria-label="État des demandes d'arbitrage"
            >
              {hasEditRequest && (
                <span
                  className={`arbitration-request-chip arbitration-request-chip--edit${
                    isRequestWaiting(editState) ? ' is-waiting' : ''
                  }`}
                >
                  Correction · {requestStateLabel(editState)}
                </span>
              )}
              {hasCancelRequest && (
                <span
                  className={`arbitration-request-chip arbitration-request-chip--delete${
                    isRequestWaiting(cancelState) ? ' is-waiting' : ''
                  }`}
                >
                  Annulation · {requestStateLabel(cancelState)}
                </span>
              )}
            </div>
          </div>

          <div className="arbitration-context-grid">
            <DecisionField label="Incident" emphasis>
              {incident.line_number} · {incident.machine_id}
            </DecisionField>
            <DecisionField label="État">{STATE_LABELS[incident.state]}</DecisionField>
            <DecisionField label="Robot">
              {incident.robot_label} · Tête {incident.head_number}
            </DecisionField>
            <DecisionField label="Produit">
              {currentProduct || <span className="detail-value-muted">Non renseigné</span>}
            </DecisionField>
            <DecisionField label="Prise en charge">{takenByLabel}</DecisionField>
            <DecisionField label="Priorité">{priorityLabel}</DecisionField>
          </div>

          {incident.responsible_comment && (
            <div className="arbitration-responsible-callout">
              <span className="detail-field-label">Consigne responsable</span>
              <p>{incident.responsible_comment}</p>
            </div>
          )}

          {hasNarrativeContext && (
            <div className="arbitration-narrative-strip" aria-label="Contexte atelier">
              {incident.comment && (
                <DecisionField label="Signalement">{incident.comment}</DecisionField>
              )}
              {incident.diagnostic && (
                <DecisionField label="Diagnostic">{incident.diagnostic}</DecisionField>
              )}
              {incident.intervention_note && (
                <DecisionField label="Intervention">{incident.intervention_note}</DecisionField>
              )}
            </div>
          )}
        </section>

        {requestCount > 1 && (
          <div className="arbitration-system-note arbitration-system-note--strong">
            Deux demandes sont ouvertes sur cet incident. La décision finale doit tenir compte des
            deux.
          </div>
        )}

        {error && <div className="error-message">{error}</div>}
      </div>
    </Modal>
  );
}
