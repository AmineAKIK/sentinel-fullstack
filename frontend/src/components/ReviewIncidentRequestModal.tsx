import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Modal from './Modal';
import CharCounter from './ui/CharCounter';
import { ProductionLine, WorkshopIncident } from '../types';
import { ROLE_LABELS, STATE_LABELS } from '../utils/labels';
import { FIELD_LIMITS } from '../utils/fieldLimits';
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
  onRejectEdit?: (decisionReason: string) => void;
  onApproveDelete?: () => void;
  onRejectDelete?: (decisionReason: string) => void;
}

// Formulaire de motif de refus (RC3, lot 4). Affiché uniquement lorsque le refus
// est choisi. Le motif est normalisé (trim), non vide et borné exactement comme
// le backend (FIELD_LIMITS.COMMENT). La soumission est bloquée si le motif est
// invalide, le focus est placé sur le champ, et la saisie est conservée après
// une erreur (l'état vit dans le composant parent, la modale reste ouverte).
function RejectReasonForm({
  value,
  onChange,
  onConfirm,
  onCancel,
  loading,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const trimmed = value.trim();
  const invalid = trimmed.length === 0 || trimmed.length > FIELD_LIMITS.COMMENT;
  return (
    <div className="arbitration-reject-form">
      <label className="form-label" htmlFor="decisionReason">
        Motif du refus
      </label>
      <textarea
        id="decisionReason"
        ref={inputRef}
        className="form-input"
        rows={3}
        maxLength={FIELD_LIMITS.COMMENT}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        aria-required="true"
        aria-invalid={invalid || undefined}
      />
      <CharCounter current={value.length} max={FIELD_LIMITS.COMMENT} />
      <div className="arbitration-footer-group arbitration-footer-group--decision">
        <button className="btn btn-secondary" onClick={onCancel} disabled={loading} type="button">
          Annuler
        </button>
        <button
          className="btn btn-danger"
          onClick={onConfirm}
          disabled={loading || invalid}
          type="button"
        >
          {loading ? 'Refus…' : 'Confirmer le refus'}
        </button>
      </div>
    </div>
  );
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
  // Mode « refus » : quand actif, le champ Motif du refus remplace les boutons de
  // décision. La saisie est conservée tant que la modale reste ouverte (échec).
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const rejectInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!error || !rejectMode) return;
    rejectInputRef.current?.focus();
  }, [error, rejectMode]);

  function enterRejectMode() {
    setRejectMode(true);
    // Focus au champ dès son apparition.
    requestAnimationFrame(() => rejectInputRef.current?.focus());
  }
  function confirmReject() {
    const reason = rejectReason.trim();
    if (reason.length === 0 || reason.length > FIELD_LIMITS.COMMENT) {
      rejectInputRef.current?.focus();
      return;
    }
    // Même formulaire de motif pour les deux contrats, routé selon le type — les
    // contrats métier restent distincts côté service.
    if (type === 'edit') onRejectEdit?.(reason);
    else onRejectDelete?.(reason);
  }

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
            Annuler
          </button>
          {onConsult && hasConsultableArbitration && (
            <button className="btn btn-outline" onClick={onConsult} disabled={loading}>
              {consultLabel}
            </button>
          )}
        </div>
        {rejectMode ? (
          <RejectReasonForm
            value={rejectReason}
            onChange={setRejectReason}
            onConfirm={confirmReject}
            onCancel={() => setRejectMode(false)}
            loading={loading}
            inputRef={rejectInputRef}
          />
        ) : (
          <div className="arbitration-footer-group arbitration-footer-group--decision">
            {allowEditReject && (
              <button
                className="btn btn-secondary"
                onClick={enterRejectMode}
                disabled={loading || editDisabled}
                type="button"
              >
                Refuser la demande
              </button>
            )}
            {allowEditApply && (
              <button
                className="btn btn-primary"
                onClick={onApplyEdit}
                disabled={loading || editDisabled}
                type="button"
              >
                {loading ? 'Application…' : 'Appliquer la correction'}
              </button>
            )}
          </div>
        )}
      </div>
    ) : (
      <div className="arbitration-footer">
        <div className="arbitration-footer-group">
          <button className="btn btn-secondary" onClick={report} disabled={loading}>
            Annuler
          </button>
          {onConsult && hasConsultableArbitration && (
            <button className="btn btn-outline" onClick={onConsult} disabled={loading}>
              {consultLabel}
            </button>
          )}
        </div>
        {rejectMode ? (
          <RejectReasonForm
            value={rejectReason}
            onChange={setRejectReason}
            onConfirm={confirmReject}
            onCancel={() => setRejectMode(false)}
            loading={loading}
            inputRef={rejectInputRef}
          />
        ) : (
          <div className="arbitration-footer-group arbitration-footer-group--decision">
            {allowDeleteReject && (
              <button
                className="btn btn-secondary"
                onClick={enterRejectMode}
                disabled={loading}
                type="button"
              >
                Refuser la demande
              </button>
            )}
            {allowDeleteApproval && (
              <button
                className="btn btn-danger"
                onClick={onApproveDelete}
                disabled={loading || deleteApprovalDisabled}
                type="button"
              >
                {loading ? 'Annulation…' : "Confirmer l'annulation"}
              </button>
            )}
          </div>
        )}
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
                <div className="arbitration-system-note arbitration-system-note--danger">
                  Cette annulation est définitive. L’incident sera conservé dans l’historique avec
                  la trace de la décision.
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

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
