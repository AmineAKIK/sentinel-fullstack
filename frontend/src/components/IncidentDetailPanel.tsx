import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateIncidentModal from './CreateIncidentModal';
import DeleteRequestModal from './DeleteRequestModal';
import TakeChargeConfirmModal from './TakeChargeConfirmModal';
import PendingConfirmModal from './PendingConfirmModal';
import ResumeIncidentConfirmModal from './ResumeIncidentConfirmModal';
import CloseIncidentModal from './CloseIncidentModal';
import InvalidateIncidentModal from './InvalidateIncidentModal';
import MaintenanceDeleteConfirmModal from './MaintenanceDeleteConfirmModal';
import ReviewIncidentRequestModal from './ReviewIncidentRequestModal';
import UnfollowIncidentConfirmModal from './UnfollowIncidentConfirmModal';
import DeleteResponsibleCommentConfirmModal from './DeleteResponsibleCommentConfirmModal';
import DetailField from './ui/DetailField';
import CharCounter from './ui/CharCounter';
import { ProductionLine, WorkshopIncident } from '../types';
import { Role } from '../types/common';
import { formatDateTime } from '../utils/date';
import { useFieldLimits } from '../routes/FieldLimitsContext';
import { ROLE_LABELS } from '../utils/labels';
import { canPerform } from '../utils/workshopPermissions';
import { ModalStateApi } from '../hooks/useModalState';
import { sortIncidents } from '../utils/incidentSort';
import {
  IncidentFollowedChip,
  IncidentPriorityChip,
  IncidentStateChip,
  IncidentStatusChip,
  IncidentTakenChip,
  isIncidentResolved,
} from './IncidentBadges';

interface IncidentDetailPanelProps {
  incident: WorkshopIncident;
  lines: ProductionLine[];
  modal: ModalStateApi;
  userRole: Role | undefined;
  userId: number | undefined;
  isMaintenance: boolean;
  isResponsable: boolean;
  // Navigation dans la liste visible (triée/filtrée) sans quitter le drawer.
  navigation?: {
    index: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
  };
  onBack: () => void;
  onToggleFollow: (incident: WorkshopIncident) => Promise<void>;
  onToggleUrgent: (incident: WorkshopIncident) => Promise<void>;
  onConfirmTakeCharge: () => Promise<void>;
  onRequestDelete: (reason: string) => Promise<void>;
  onSetPending: (reason: string) => Promise<void>;
  onResumeIncident: () => Promise<void>;
  onCloseIncident: (note: string) => Promise<void>;
  onInvalidateIncident: (reason: string) => Promise<void>;
  onMaintenanceDeleteConfirm: (mode: 'direct' | 'approve') => Promise<void>;
  onApplyEditRequest: () => Promise<void>;
  onRejectEditRequest: () => Promise<void>;
  onApproveDeleteRequest: () => Promise<void>;
  onRejectDeleteRequest: () => Promise<void>;
  onEditSuccess: (updated: WorkshopIncident) => void;
  onDeleteCommentConfirm: (incident: WorkshopIncident) => Promise<void>;
  patchIncident: (id: number, payload: Record<string, unknown>) => Promise<WorkshopIncident>;
}

export default function IncidentDetailPanel({
  incident,
  lines,
  modal,
  userRole,
  userId,
  isMaintenance: _isMaintenance,
  isResponsable,
  navigation,
  onBack,
  onToggleFollow,
  onToggleUrgent,
  onConfirmTakeCharge,
  onRequestDelete,
  onSetPending,
  onResumeIncident,
  onCloseIncident,
  onInvalidateIncident,
  onMaintenanceDeleteConfirm,
  onApplyEditRequest,
  onRejectEditRequest,
  onApproveDeleteRequest,
  onRejectDeleteRequest,
  onEditSuccess,
  onDeleteCommentConfirm,
  patchIncident,
}: IncidentDetailPanelProps) {
  const navigate = useNavigate();
  const FIELD_LIMITS = useFieldLimits();
  const [responsibleDraft, setResponsibleDraft] = useState(incident.responsible_comment ?? '');

  // Le panneau reste monté quand on navigue d'un incident à l'autre (le focus
  // des boutons prev/next survit) : le brouillon se resynchronise ici.
  useEffect(() => {
    setResponsibleDraft(incident.responsible_comment ?? '');
  }, [incident.id, incident.responsible_comment]);

  // Contexte machine : amène directement à l'historique / la connaissance de
  // cette ligne+machine, filtre pré-rempli (P3 — répondre, pas faire chercher).
  const machineContextQuery = `line=${incident.line_id}&machine=${encodeURIComponent(incident.machine_id)}`;

  const canRequestEdit = canPerform(userRole, 'requestEdit', incident, userId);
  const canDirectEdit = canPerform(userRole, 'directEdit', incident);
  const canResponsableEdit = canPerform(userRole, 'responsableEdit', incident);
  const canWithdrawEdit = canPerform(userRole, 'withdrawEdit', incident, userId);
  const canRequestCancel = canPerform(userRole, 'requestCancel', incident, userId);
  const canCancel = canPerform(userRole, 'cancel', incident);
  const canTake = canPerform(userRole, 'take', incident);
  const canSetPending = canPerform(userRole, 'setPending', incident);
  const canResume = canPerform(userRole, 'resume', incident);
  const canClose = canPerform(userRole, 'close', incident);
  const canSetPriority = canPerform(userRole, 'setPriority', incident);
  const canEditResponsibleComment = canPerform(userRole, 'responsibleComment', incident);
  const canInvalidateClosed = canPerform(userRole, 'invalidateClosed', incident);
  const isResolved = isIncidentResolved(incident);
  const creatorName = `${incident.first_name} ${incident.last_name}`.trim();
  const currentProduct = incident.current_product?.trim();
  const takenByName = incident.taken_by_first_name
    ? `${incident.taken_by_first_name} ${incident.taken_by_last_name ?? ''}`.trim()
    : '';
  const hasPrimaryActions =
    isResponsable ||
    canRequestEdit ||
    canDirectEdit ||
    canResponsableEdit ||
    canWithdrawEdit ||
    canTake;
  const hasDangerActions = canRequestCancel || canCancel || canInvalidateClosed;
  const hasDetailActions = hasPrimaryActions || hasDangerActions;
  const hasNarrative =
    Boolean(incident.comment) ||
    Boolean(incident.diagnostic) ||
    Boolean(incident.intervention_note) ||
    Boolean(incident.edit_request) ||
    Boolean(incident.cancel_request);
  const detailHasTreatmentActions =
    canSetPending || canResume || canClose || canSetPriority || canEditResponsibleComment;

  return (
    <>
      <div className="incident-detail-topbar">
        <div className="incident-detail-heading">
          <h2 className="incident-detail-title">
            Incident {incident.line_number} · {incident.machine_id}
          </h2>
          <div className="incident-detail-badges" aria-label="Statuts de l'incident">
            <IncidentStateChip incident={incident} />
            <IncidentPriorityChip incident={incident} />
            <IncidentStatusChip incident={incident} showOpen />
            {incident.is_followed && <IncidentFollowedChip />}
            {!isResolved && <IncidentTakenChip incident={incident} />}
          </div>
        </div>
        {navigation && navigation.total > 1 && (
          <div
            className="incident-detail-nav"
            role="group"
            aria-label="Navigation entre les incidents de la liste"
          >
            <button
              type="button"
              className="incident-detail-iconbtn"
              onClick={navigation.onPrev}
              disabled={navigation.index <= 0}
              aria-label="Incident précédent"
              title="Incident précédent"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <span className="incident-detail-position" aria-live="polite">
              {navigation.index + 1}/{navigation.total}
            </span>
            <button
              type="button"
              className="incident-detail-iconbtn"
              onClick={navigation.onNext}
              disabled={navigation.index >= navigation.total - 1}
              aria-label="Incident suivant"
              title="Incident suivant"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        )}
        <button
          type="button"
          className="incident-detail-iconbtn"
          onClick={onBack}
          aria-label="Fermer le détail"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {hasDetailActions && (
        <div className="incident-detail-header">
          <div className="incident-detail-actions">
            {hasPrimaryActions && (
              <div className="incident-action-group" aria-label="Actions principales">
                {isResponsable && (
                  <button
                    className={incident.is_followed ? 'btn btn-secondary' : 'btn btn-primary'}
                    onClick={() => void onToggleFollow(incident)}
                  >
                    {incident.is_followed ? 'Retirer du suivi' : 'Suivre'}
                  </button>
                )}
                {(canRequestEdit || canDirectEdit || canResponsableEdit) && (
                  <button className="btn btn-outline" onClick={() => modal.openModal('edit')}>
                    {canRequestEdit ? 'Demander une correction' : 'Modifier'}
                  </button>
                )}
                {canWithdrawEdit && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => void patchIncident(incident.id, { withdrawEditRequest: true })}
                  >
                    Retirer ma demande
                  </button>
                )}
                {canTake && (
                  <button className="btn btn-primary" onClick={() => modal.openModal('takeCharge')}>
                    Prendre en charge
                  </button>
                )}
              </div>
            )}
            {hasDangerActions && (
              <div
                className="incident-action-group incident-action-group--danger"
                aria-label="Actions sensibles"
              >
                {(canRequestCancel || canCancel) && (
                  <button
                    className="btn btn-danger"
                    onClick={() =>
                      canCancel
                        ? modal.openModal('maintenanceDirect')
                        : modal.openModal('deleteRequest')
                    }
                  >
                    {canCancel ? "Annuler l'incident" : "Demander l'annulation"}
                  </button>
                )}
                {canInvalidateClosed && (
                  <button className="btn btn-danger" onClick={() => modal.openModal('invalidate')}>
                    Invalider
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card incident-detail-card">
        <div className="card-body incident-detail-body">
          <section
            className="incident-detail-section"
            aria-labelledby={`incident-equipment-${incident.id}`}
          >
            <h3 id={`incident-equipment-${incident.id}`} className="incident-section-title">
              Équipement
            </h3>
            <div className="incident-detail-section-grid">
              <DetailField label="Ligne">{incident.line_number}</DetailField>
              <DetailField label="Machine">
                {incident.machine_id} · {incident.machine_brand}
              </DetailField>
              <DetailField label="Robot">{incident.robot_label}</DetailField>
              <DetailField label="Tête">{incident.head_number}</DetailField>
              <DetailField label="Produit en cours">
                {currentProduct || <span className="detail-value-muted">Non renseigné</span>}
              </DetailField>
            </div>
          </section>

          <section
            className="incident-detail-section"
            aria-labelledby={`incident-treatment-${incident.id}`}
          >
            <h3 id={`incident-treatment-${incident.id}`} className="incident-section-title">
              Traitement
            </h3>
            <div className="incident-detail-section-grid">
              <DetailField label="Statut">
                <IncidentStatusChip incident={incident} showOpen />
              </DetailField>
              <DetailField label="Priorité">
                {incident.is_priority && !isResolved ? (
                  <IncidentPriorityChip incident={incident} />
                ) : (
                  <span className="incident-chip incident-chip--neutral">Normale</span>
                )}
              </DetailField>
              <DetailField label="Prise en charge">
                <IncidentTakenChip incident={incident} />
              </DetailField>
              <DetailField label="Technicien">
                {takenByName ? (
                  <>
                    {takenByName}
                    {incident.taken_by_role
                      ? ` · ${ROLE_LABELS[incident.taken_by_role] || incident.taken_by_role}`
                      : ''}
                  </>
                ) : (
                  <span className="detail-value-muted">Aucun technicien</span>
                )}
              </DetailField>
            </div>
          </section>

          <section
            className="incident-detail-section"
            aria-labelledby={`incident-origin-${incident.id}`}
          >
            <h3 id={`incident-origin-${incident.id}`} className="incident-section-title">
              Origine
            </h3>
            <div className="incident-detail-section-grid">
              <DetailField label="Déclaré par">{creatorName}</DetailField>
              <DetailField label="Rôle créateur">
                {ROLE_LABELS[incident.role] ?? incident.role}
              </DetailField>
              <DetailField label="Création">{formatDateTime(incident.created_at)}</DetailField>
            </div>
          </section>

          <section
            className="incident-detail-section"
            aria-labelledby={`incident-context-${incident.id}`}
          >
            <h3 id={`incident-context-${incident.id}`} className="incident-section-title">
              Contexte machine
            </h3>
            <div className="machine-context-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => navigate(`/workshop/knowledge?${machineContextQuery}`)}
              >
                Solutions déjà appliquées
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => navigate(`/workshop/history?${machineContextQuery}`)}
              >
                Historique de la machine
              </button>
            </div>
          </section>

          {hasNarrative && (
            <section
              className="incident-detail-section incident-detail-section--notes"
              aria-labelledby={`incident-notes-${incident.id}`}
            >
              <h3 id={`incident-notes-${incident.id}`} className="incident-section-title">
                Notes
              </h3>
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
              {incident.edit_request && (
                <div className="incident-detail-request incident-detail-request--edit">
                  Correction opérateur en attente d'arbitrage.
                </div>
              )}
              {incident.cancel_request && (
                <div className="incident-detail-request incident-detail-request--delete">
                  Annulation opérateur en attente d'arbitrage.
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {detailHasTreatmentActions && (
        <div className="card incident-treatment-card">
          <div className="card-body">
            <h3 className="incident-section-title">Actions de traitement</h3>
            <div className="action-bar">
              {canResume && (
                <button className="btn btn-outline" onClick={() => modal.openModal('resume')}>
                  Reprendre
                </button>
              )}
              {canSetPending && (
                <button className="btn btn-outline" onClick={() => modal.openModal('pending')}>
                  Suspendre
                </button>
              )}
              {canClose && (
                <button className="btn btn-primary" onClick={() => modal.openModal('close')}>
                  Clôturer
                </button>
              )}
              {canSetPriority && (
                <button
                  className={incident.is_priority ? 'btn btn-secondary' : 'btn btn-danger'}
                  onClick={() => void onToggleUrgent(incident)}
                >
                  {incident.is_priority ? "Retirer l'urgence" : 'Déclarer urgent'}
                </button>
              )}
            </div>
            {canEditResponsibleComment && (
              <div className="incident-responsible-editor">
                <div className="form-group">
                  <label
                    className="form-label"
                    htmlFor={`responsible-comment-detail-${incident.id}`}
                  >
                    Consigne responsable
                  </label>
                  <textarea
                    id={`responsible-comment-detail-${incident.id}`}
                    className="form-input"
                    rows={3}
                    value={responsibleDraft}
                    onChange={(e) =>
                      setResponsibleDraft(e.target.value.slice(0, FIELD_LIMITS.COMMENT))
                    }
                    maxLength={FIELD_LIMITS.COMMENT}
                    placeholder="Consigne courte pour orienter le traitement"
                  />
                  <CharCounter current={responsibleDraft.length} max={FIELD_LIMITS.COMMENT} />
                </div>
                <div className="action-bar">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      void patchIncident(incident.id, {
                        responsibleComment: responsibleDraft.trim(),
                      })
                    }
                    disabled={!responsibleDraft.trim()}
                  >
                    {incident.responsible_comment ? 'Mettre à jour' : 'Ajouter'}
                  </button>
                  {incident.responsible_comment && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => modal.setDeleteCommentConfirm(incident)}
                    >
                      Retirer la consigne
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modales du panneau détail */}
      {modal.state.activeModal === 'edit' && (
        <CreateIncidentModal
          lines={lines}
          incident={incident}
          onClose={() => modal.closeModal()}
          onSuccess={(updated) => {
            modal.closeModal();
            onEditSuccess(updated);
          }}
          requestOnly={canRequestEdit}
        />
      )}
      {modal.state.activeModal === 'deleteRequest' && (
        <DeleteRequestModal
          incident={incident}
          onClose={() => modal.closeModal()}
          onConfirm={onRequestDelete}
        />
      )}
      {modal.state.activeModal === 'takeCharge' && (
        <TakeChargeConfirmModal
          incident={incident}
          onClose={() => modal.closeModal()}
          onConfirm={onConfirmTakeCharge}
        />
      )}
      {modal.state.activeModal === 'pending' && (
        <PendingConfirmModal
          incident={incident}
          onClose={() => modal.closeModal()}
          onConfirm={onSetPending}
        />
      )}
      {modal.state.activeModal === 'resume' && (
        <ResumeIncidentConfirmModal
          incident={incident}
          onClose={() => modal.closeModal()}
          onConfirm={onResumeIncident}
        />
      )}
      {modal.state.activeModal === 'close' && (
        <CloseIncidentModal
          incident={incident}
          onClose={() => modal.closeModal()}
          onConfirm={onCloseIncident}
        />
      )}
      {modal.state.activeModal === 'invalidate' && (
        <InvalidateIncidentModal
          incident={incident}
          onClose={() => modal.closeModal()}
          onConfirm={onInvalidateIncident}
        />
      )}
      {(modal.state.activeModal === 'maintenanceDirect' ||
        modal.state.activeModal === 'maintenanceApprove') &&
        (modal.state.activeModal === 'maintenanceDirect' || modal.state.reviewIncident) && (
          <MaintenanceDeleteConfirmModal
            incident={
              modal.state.activeModal === 'maintenanceApprove'
                ? modal.state.reviewIncident!
                : incident
            }
            title={
              modal.state.activeModal === 'maintenanceApprove'
                ? "Valider l'annulation"
                : "Annuler l'incident"
            }
            message={
              modal.state.activeModal === 'maintenanceApprove'
                ? "Cette validation annule l'incident demandé par l'opérateur et conserve la trace dans l'historique."
                : "Cette action annule l'incident et le conserve dans l'historique. Confirmez uniquement s'il s'agit d'une erreur ou d'un doublon."
            }
            error={modal.state.reviewError}
            onClose={() => modal.closeModal()}
            onConfirm={() =>
              onMaintenanceDeleteConfirm(
                modal.state.activeModal === 'maintenanceDirect' ? 'direct' : 'approve'
              )
            }
          />
        )}
      {modal.state.reviewIncident && modal.state.reviewType && (
        <ReviewIncidentRequestModal
          incident={modal.state.reviewIncident}
          lines={lines}
          type={modal.state.reviewType}
          loading={modal.state.reviewLoading}
          error={modal.state.reviewError}
          onClose={modal.closeReview}
          onApplyEdit={onApplyEditRequest}
          onRejectEdit={onRejectEditRequest}
          onApproveDelete={onApproveDeleteRequest}
          onRejectDelete={onRejectDeleteRequest}
          allowDeleteApproval={canPerform(userRole, 'approveCancel', modal.state.reviewIncident)}
          allowDeleteReject={canPerform(userRole, 'rejectCancel', modal.state.reviewIncident)}
          deleteApprovalDisabled={
            !canPerform(userRole, 'approveCancel', modal.state.reviewIncident)
          }
          deleteWarning={
            canPerform(userRole, 'approveCancel', modal.state.reviewIncident)
              ? "L'annulation conserve l'incident dans l'historique avec sa trace de décision."
              : undefined
          }
          allowEditApply={canPerform(userRole, 'approveEdit', modal.state.reviewIncident)}
          allowEditReject={canPerform(userRole, 'rejectEdit', modal.state.reviewIncident)}
          editDisabled={!canPerform(userRole, 'approveEdit', modal.state.reviewIncident)}
          editWarning={
            !canPerform(userRole, 'approveEdit', modal.state.reviewIncident)
              ? 'Seul le responsable peut arbitrer une demande de correction active.'
              : undefined
          }
        />
      )}
      {modal.state.unfollowConfirmIncident && (
        <UnfollowIncidentConfirmModal
          incident={modal.state.unfollowConfirmIncident}
          onClose={() => modal.setUnfollowConfirm(null)}
          onConfirm={() => onToggleFollow(modal.state.unfollowConfirmIncident!)}
        />
      )}
      {modal.state.deleteResponsibleCommentIncident && (
        <DeleteResponsibleCommentConfirmModal
          incident={modal.state.deleteResponsibleCommentIncident}
          onClose={() => modal.setDeleteCommentConfirm(null)}
          onConfirm={() => onDeleteCommentConfirm(modal.state.deleteResponsibleCommentIncident!)}
        />
      )}
    </>
  );
}

export function useSortedIncidents(
  incidents: Array<ReturnType<typeof sortIncidents>[0]>,
  sortOrder: 'default' | 'date_desc' | 'date_asc'
) {
  if (sortOrder === 'default') return incidents;
  return [...incidents].sort((a, b) => {
    const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    return sortOrder === 'date_desc' ? diff : -diff;
  });
}
