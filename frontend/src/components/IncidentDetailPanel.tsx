import { useState } from 'react';
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
import { ROLE_LABELS, STATE_LABELS, STATUS_LABELS } from '../utils/labels';
import { canPerform } from '../utils/workshopPermissions';
import { ModalStateApi } from '../hooks/useModalState';
import { sortIncidents } from '../utils/incidentSort';

interface IncidentDetailPanelProps {
  incident: WorkshopIncident;
  lines: ProductionLine[];
  modal: ModalStateApi;
  userRole: Role | undefined;
  userId: number | undefined;
  isMaintenance: boolean;
  isResponsable: boolean;
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
  const detailHasTreatmentActions = canSetPending || canResume || canClose || canSetPriority || canEditResponsibleComment;

  return (
    <>
      <button className="back-link" onClick={onBack}>
        Retour à la liste
      </button>

      <div className="page-header">
        <h1>Incident {incident.line_number} · {incident.machine_id}</h1>
        <div className="action-bar" style={{ marginTop: 0 }}>
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
          {(canRequestCancel || canCancel) && (
            <button
              className="btn btn-danger"
              onClick={() =>
                canCancel
                  ? modal.openModal('maintenanceDirect')
                  : modal.openModal('deleteRequest')
              }
            >
              {canCancel ? 'Annuler' : 'Demander annulation'}
            </button>
          )}
          {canInvalidateClosed && (
            <button className="btn btn-danger" onClick={() => modal.openModal('invalidate')}>
              Invalider
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="detail-grid">
            <DetailField label="Utilisateur">{incident.first_name} {incident.last_name}</DetailField>
            <DetailField label="Rôle créateur">{ROLE_LABELS[incident.role] ?? incident.role}</DetailField>
            <DetailField label="État">{STATE_LABELS[incident.state]}</DetailField>
            <DetailField label="Ligne">{incident.line_number}</DetailField>
            <DetailField label="Machine">{incident.machine_id} · {incident.machine_brand}</DetailField>
            <DetailField label="Robot">{incident.robot_label}</DetailField>
            <DetailField label="Tête">{incident.head_number}</DetailField>
            <DetailField label="Prise en charge">{incident.is_taken ? 'Oui' : 'Non'}</DetailField>
            <DetailField label="Pris en charge par">
              {incident.taken_by_first_name
                ? `${incident.taken_by_first_name} ${incident.taken_by_last_name ?? ''}`.trim()
                : '-'}
            </DetailField>
            <DetailField label="Priorité">{incident.is_priority ? 'Oui' : 'Non'}</DetailField>
            <DetailField label="Statut">{STATUS_LABELS[incident.status] ?? incident.status}</DetailField>
            <DetailField label="Produit en cours">{incident.current_product ?? '-'}</DetailField>
            <DetailField label="Création">{formatDateTime(incident.created_at)}</DetailField>
          </div>
          <div className="machine-context-actions">
            <span className="detail-field-label">Contexte de cette machine</span>
            <div className="action-bar" style={{ marginTop: 0 }}>
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
          </div>
          {incident.comment && <p className="incident-comment">{incident.comment}</p>}
          {incident.diagnostic && (
            <p className="incident-comment"><strong>Diagnostic :</strong> {incident.diagnostic}</p>
          )}
          {incident.intervention_note && (
            <p className="incident-comment"><strong>Intervention :</strong> {incident.intervention_note}</p>
          )}
          {incident.edit_request && (
            <div className="notice" style={{ marginTop: 16 }}>Demande de modification opérateur en attente.</div>
          )}
          {incident.cancel_request && (
            <div className="notice" style={{ marginTop: 16 }}>Demande d'annulation opérateur en attente.</div>
          )}
        </div>
      </div>

      {detailHasTreatmentActions && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-body">
            <div className="detail-field" style={{ marginBottom: 12 }}>
              <span className="detail-field-label">Coordination</span>
            </div>
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
                  {incident.is_priority ? 'Repasser normal' : 'Déclarer urgent'}
                </button>
              )}
            </div>
            {canEditResponsibleComment && (
              <div className="incident-comment">
                <div className="form-group">
                  <label className="form-label" htmlFor={`responsible-comment-detail-${incident.id}`}>
                    Consigne responsable
                  </label>
                  <textarea
                    id={`responsible-comment-detail-${incident.id}`}
                    className="form-input"
                    rows={3}
                    value={responsibleDraft}
                    onChange={(e) => setResponsibleDraft(e.target.value.slice(0, FIELD_LIMITS.COMMENT))}
                    maxLength={FIELD_LIMITS.COMMENT}
                    placeholder="Consigne courte pour orienter le traitement"
                  />
                  <CharCounter current={responsibleDraft.length} max={FIELD_LIMITS.COMMENT} />
                </div>
                <div className="action-bar">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => void patchIncident(incident.id, { responsibleComment: responsibleDraft.trim() })}
                    disabled={!responsibleDraft.trim()}
                  >
                    {incident.responsible_comment ? 'Mettre à jour' : 'Ajouter'}
                  </button>
                  {incident.responsible_comment && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => modal.setDeleteCommentConfirm(incident)}
                    >
                      Retirer
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
      {(modal.state.activeModal === 'maintenanceDirect' || modal.state.activeModal === 'maintenanceApprove') &&
        (modal.state.activeModal === 'maintenanceDirect' || modal.state.reviewIncident) && (
        <MaintenanceDeleteConfirmModal
          incident={modal.state.activeModal === 'maintenanceApprove' ? modal.state.reviewIncident! : incident}
          title={modal.state.activeModal === 'maintenanceApprove' ? "Valider l'annulation" : "Annuler l'incident"}
          message={
            modal.state.activeModal === 'maintenanceApprove'
              ? "Cette validation annule l'incident demandé par l'opérateur et conserve la trace dans l'historique."
              : "Cette action annule l'incident et le conserve dans l'historique. Confirmez uniquement s'il s'agit d'une erreur ou d'un doublon."
          }
          error={modal.state.reviewError}
          onClose={() => modal.closeModal()}
          onConfirm={() => onMaintenanceDeleteConfirm(modal.state.activeModal === 'maintenanceDirect' ? 'direct' : 'approve')}
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
          deleteApprovalDisabled={!canPerform(userRole, 'approveCancel', modal.state.reviewIncident)}
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
