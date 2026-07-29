import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateIncidentModal from './CreateIncidentModal';
import DeleteRequestModal from './DeleteRequestModal';
import TakeChargeConfirmModal from './TakeChargeConfirmModal';
import PendingConfirmModal from './PendingConfirmModal';
import ResumeIncidentConfirmModal from './ResumeIncidentConfirmModal';
import CloseIncidentModal from './CloseIncidentModal';
import InvalidateIncidentModal from './InvalidateIncidentModal';
import MaintenanceDeleteConfirmModal from './MaintenanceDeleteConfirmModal';
import UnfollowIncidentConfirmModal from './UnfollowIncidentConfirmModal';
import DeleteResponsibleCommentConfirmModal from './DeleteResponsibleCommentConfirmModal';
import DetailField from './ui/DetailField';
import CharCounter from './ui/CharCounter';
import { ProductionLine, WorkshopIncident } from '../types';
import { Role } from '../types/common';
import { formatDateTime, formatElapsed } from '../utils/date';
import { useFieldLimits } from '../routes/FieldLimitsContext';
import { formatRoleLabel } from '../utils/labels';
import { ModalStateApi, ReviewType } from '../hooks/useModalState';
import { useIncidentPermissions } from '../hooks/useIncidentPermissions';
import {
  IncidentPriorityChip,
  IncidentStateChip,
  IncidentStatusChip,
  IncidentTakenChip,
} from './IncidentBadges';
import ChevronUpIcon from './icons/ChevronUpIcon';
import ChevronDownIcon from './icons/ChevronDownIcon';
import CloseIcon from './icons/CloseIcon';
import StarIcon from './icons/StarIcon';
import ErrorBanner from './ui/ErrorBanner';
import { apiErrorMessage } from '../api/errorMessages';
import { useMutationRunner } from './ui/MutationFeedback';
import { WORKSHOP_MUTATION_KEYS } from '../utils/workshopMutationKeys';

interface IncidentDetailPanelProps {
  incident: WorkshopIncident;
  lines: ProductionLine[];
  modal: ModalStateApi;
  userRole: Role | undefined;
  userId: number | undefined;
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
  onMaintenanceDeleteConfirm: () => Promise<void>;
  onEditSuccess: (updated: WorkshopIncident) => void;
  onDeleteCommentConfirm: (incident: WorkshopIncident) => Promise<void>;
  patchIncident: (id: number, payload: Record<string, unknown>) => Promise<WorkshopIncident>;
}

type DrawerSectionProps = {
  title: string;
  eyebrow?: string;
  tone?: 'default' | 'attention' | 'danger';
  className?: string;
  children: ReactNode;
};

function DrawerSection({
  title,
  eyebrow,
  tone = 'default',
  className = '',
  children,
}: DrawerSectionProps) {
  return (
    <section
      className={`incident-dossier-section incident-dossier-section--${tone}${className ? ` ${className}` : ''}`}
    >
      <div className="incident-dossier-section-heading">
        {eyebrow && <span className="detail-field-label">{eyebrow}</span>}
        <h3 className="incident-section-title">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function SummaryItem({
  label,
  children,
  muted,
}: {
  label: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={`incident-summary-item${muted ? ' is-muted' : ''}`}>
      <span className="detail-field-label">{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function NarrativeItem({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: string | null | undefined;
  primary?: boolean;
}) {
  if (!value?.trim()) return null;

  return (
    <div className={`incident-narrative-item${primary ? ' incident-narrative-item--primary' : ''}`}>
      <span className="detail-field-label">{label}</span>
      <p>{value}</p>
    </div>
  );
}

function IncidentDecisionBlock({
  incident,
  canReviewEditRequest,
  canReviewCancelRequest,
  editArbitrationWaiting,
  cancelArbitrationWaiting,
  onReview,
}: {
  incident: WorkshopIncident;
  canReviewEditRequest: boolean;
  canReviewCancelRequest: boolean;
  editArbitrationWaiting: boolean;
  cancelArbitrationWaiting: boolean;
  onReview: (type: ReviewType) => void;
}) {
  const hasEditRequest = Boolean(incident.edit_request);
  const hasCancelRequest = Boolean(incident.cancel_request);
  if (!hasEditRequest && !hasCancelRequest) return null;

  const actionable = canReviewEditRequest || canReviewCancelRequest;
  const activeRequestCount = Number(hasEditRequest) + Number(hasCancelRequest);

  return (
    <DrawerSection
      title={actionable ? 'Décision requise' : 'Demande en cours'}
      eyebrow="Arbitrage"
      tone={actionable ? 'attention' : 'default'}
      className="incident-decision-section"
    >
      {activeRequestCount > 1 && (
        <div className="notice incident-decision-notice">
          Deux demandes sont actives sur cet incident.
        </div>
      )}
      <div className="incident-decision-list">
        {hasEditRequest && (
          <div
            className={`incident-decision-item incident-decision-item--edit${
              editArbitrationWaiting ? ' is-waiting' : ''
            }`}
          >
            <div>
              <span className="incident-decision-state">
                {editArbitrationWaiting ? 'En consultation' : 'Active'}
              </span>
              <strong>Correction opérateur</strong>
              <p>
                {editArbitrationWaiting
                  ? 'Consultée, décision encore ouverte.'
                  : 'Nouveau cas à arbitrer.'}
              </p>
            </div>
            {canReviewEditRequest && (
              <button
                type="button"
                className={editArbitrationWaiting ? 'btn btn-outline' : 'btn btn-primary'}
                onClick={() => onReview('edit')}
              >
                {editArbitrationWaiting ? 'Reprendre' : 'Arbitrer'}
              </button>
            )}
          </div>
        )}
        {hasCancelRequest && (
          <div
            className={`incident-decision-item incident-decision-item--delete${
              cancelArbitrationWaiting ? ' is-waiting' : ''
            }`}
          >
            <div>
              <span className="incident-decision-state">
                {cancelArbitrationWaiting ? 'En consultation' : 'Active'}
              </span>
              <strong>Annulation opérateur</strong>
              <p>
                {cancelArbitrationWaiting
                  ? 'Consultée, décision encore ouverte.'
                  : 'Décision nécessaire avant clôture de la demande.'}
              </p>
            </div>
            {canReviewCancelRequest && (
              <button
                type="button"
                className={cancelArbitrationWaiting ? 'btn btn-outline' : 'btn btn-danger'}
                onClick={() => onReview('delete')}
              >
                {cancelArbitrationWaiting ? 'Reprendre' : 'Arbitrer'}
              </button>
            )}
          </div>
        )}
      </div>
    </DrawerSection>
  );
}

export default function IncidentDetailPanel({
  incident,
  lines,
  modal,
  userRole,
  userId,
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
  onEditSuccess,
  onDeleteCommentConfirm,
  patchIncident,
}: IncidentDetailPanelProps) {
  const navigate = useNavigate();
  const FIELD_LIMITS = useFieldLimits();
  const [responsibleDraft, setResponsibleDraft] = useState(incident.responsible_comment ?? '');
  const [actionError, setActionError] = useState('');
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const responsibleInputRef = useRef<HTMLTextAreaElement | null>(null);
  const mutation = useMutationRunner();

  useEffect(() => {
    setResponsibleDraft(incident.responsible_comment ?? '');
    setActionError('');
  }, [incident.id, incident.responsible_comment]);

  // Ouverture / navigation du dossier : on déplace le focus sur le titre du
  // panneau pour qu'un utilisateur au clavier entre bien dans le dossier
  // fraîchement ouvert (et puisse le lire/naviguer), au lieu de rester sur la
  // carte de la liste. Le titre est focusable programmatiquement (tabIndex=-1)
  // sans entrer dans l'ordre de tabulation (lot 8, accessibilité).
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [incident.id]);

  const machineContextQuery = `line=${incident.line_id}&machine=${encodeURIComponent(incident.machine_id)}`;

  const {
    canRequestEdit,
    canDirectEdit,
    canResponsableEdit,
    canWithdrawEdit,
    canRequestCancel,
    canWithdrawCancel,
    canCancel,
    canTake,
    canSetPending,
    canResume,
    canClose,
    canSetPriority,
    canEditResponsibleComment,
    canInvalidateClosed,
    canReviewEditRequest,
    canReviewCancelRequest,
    isResolved,
    hasWorkflowActions,
    hasStandardActions,
    hasDangerActions,
    hasResponsibleInstruction,
  } = useIncidentPermissions(incident, userRole, userId, isResponsable);

  const creatorName = `${incident.first_name} ${incident.last_name}`.trim();
  const currentProduct = incident.current_product?.trim();
  const takenByName = incident.taken_by_first_name
    ? `${incident.taken_by_first_name} ${incident.taken_by_last_name ?? ''}`.trim()
    : '';
  // Le motif de mise en attente n'a de sens que tant que l'incident est
  // suspendu (à la reprise il est effacé, mais reste dans l'historique).
  const waitingReason = incident.status === 'PENDING' ? incident.waiting_reason : null;
  const hasNarrative =
    Boolean(incident.comment?.trim()) ||
    Boolean(incident.diagnostic?.trim()) ||
    Boolean(waitingReason?.trim()) ||
    Boolean(incident.intervention_note?.trim());
  const editArbitrationWaiting = incident.arbitration?.edit?.state === 'WAITING';
  const cancelArbitrationWaiting = incident.arbitration?.cancel?.state === 'WAITING';

  return (
    <>
      <div className="incident-detail-topbar">
        <div className="incident-detail-heading">
          <span className="incident-detail-eyebrow">Dossier incident</span>
          <h2 className="incident-detail-title" ref={titleRef} tabIndex={-1}>
            Ligne {incident.line_number} · {incident.machine_id}
          </h2>
        </div>
        <div className="incident-detail-toolbar">
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
                disabled={mutation.pending || navigation.index <= 0}
                aria-label="Incident précédent"
                title="Incident précédent"
              >
                <ChevronUpIcon />
              </button>
              <span className="incident-detail-position" aria-live="polite">
                {navigation.index + 1}/{navigation.total}
              </span>
              <button
                type="button"
                className="incident-detail-iconbtn"
                onClick={navigation.onNext}
                disabled={mutation.pending || navigation.index >= navigation.total - 1}
                aria-label="Incident suivant"
                title="Incident suivant"
              >
                <ChevronDownIcon />
              </button>
            </div>
          )}
          {isResponsable && (
            <button
              type="button"
              className={`incident-detail-iconbtn incident-detail-followbtn${
                incident.is_followed ? ' is-active' : ''
              }`}
              onClick={() => void onToggleFollow(incident)}
              disabled={mutation.pending}
              aria-label={
                mutation.isPending(WORKSHOP_MUTATION_KEYS.FOLLOW)
                  ? 'Modification du suivi…'
                  : incident.is_followed
                    ? 'Retirer du suivi'
                    : 'Suivre cet incident'
              }
              title={incident.is_followed ? 'Retirer du suivi' : 'Suivre cet incident'}
            >
              <StarIcon filled={Boolean(incident.is_followed)} />
            </button>
          )}
          <button
            type="button"
            className="incident-detail-iconbtn"
            onClick={onBack}
            disabled={mutation.pending}
            aria-label="Fermer le détail"
            title="Fermer"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      <div className="incident-detail-content" aria-busy={mutation.pending || undefined}>
        {actionError && <ErrorBanner>{actionError}</ErrorBanner>}
        <section className="incident-summary-strip" aria-label="Synthèse de l'incident">
          <SummaryItem label="État">
            <IncidentStateChip incident={incident} />
          </SummaryItem>
          <SummaryItem label="Statut">
            <IncidentStatusChip incident={incident} showOpen />
          </SummaryItem>
          <SummaryItem label="Priorité" muted={!incident.is_priority || isResolved}>
            {incident.is_priority && !isResolved ? (
              <IncidentPriorityChip incident={incident} />
            ) : (
              'Normale'
            )}
          </SummaryItem>
          <SummaryItem label="Prise en charge">
            <IncidentTakenChip incident={incident} />
          </SummaryItem>
          <SummaryItem label="Ancienneté">
            <span title={formatDateTime(incident.created_at)}>
              Depuis {formatElapsed(incident.created_at)}
            </span>
          </SummaryItem>
        </section>

        <IncidentDecisionBlock
          incident={incident}
          canReviewEditRequest={canReviewEditRequest}
          canReviewCancelRequest={canReviewCancelRequest}
          editArbitrationWaiting={editArbitrationWaiting}
          cancelArbitrationWaiting={cancelArbitrationWaiting}
          onReview={(type) => modal.openReview(incident, type)}
        />

        {hasWorkflowActions && (
          <DrawerSection title="Pilotage du traitement" eyebrow="Actions">
            <div className="incident-action-row">
              {canTake && (
                <button
                  className="btn btn-primary"
                  onClick={() => modal.openModal('takeCharge')}
                  disabled={mutation.pending}
                >
                  Prendre en charge
                </button>
              )}
              {canResume && (
                <button
                  className="btn btn-primary"
                  onClick={() => modal.openModal('resume')}
                  disabled={mutation.pending}
                >
                  Reprendre
                </button>
              )}
              {canSetPending && (
                <button
                  className="btn btn-outline"
                  onClick={() => modal.openModal('pending')}
                  disabled={mutation.pending}
                >
                  Suspendre
                </button>
              )}
              {canClose && (
                <button
                  className="btn btn-primary"
                  onClick={() => modal.openModal('close')}
                  disabled={mutation.pending}
                >
                  Clôturer
                </button>
              )}
              {canSetPriority && (
                <button
                  className={incident.is_priority ? 'btn btn-critical-outline' : 'btn btn-critical'}
                  onClick={() => void onToggleUrgent(incident)}
                  disabled={mutation.pending}
                  aria-pressed={incident.is_priority}
                >
                  {mutation.isPending(WORKSHOP_MUTATION_KEYS.PRIORITY)
                    ? 'Modification…'
                    : incident.is_priority
                      ? "Retirer l'urgence"
                      : 'Déclarer urgent'}
                </button>
              )}
            </div>
          </DrawerSection>
        )}

        {hasStandardActions && (
          <DrawerSection title="Actions disponibles">
            <div className="incident-action-row">
              {(canRequestEdit || canDirectEdit || canResponsableEdit) && (
                <button
                  className="btn btn-outline"
                  onClick={() => modal.openModal('edit')}
                  disabled={mutation.pending}
                >
                  {canRequestEdit ? 'Demander une correction' : 'Modifier'}
                </button>
              )}
              {canWithdrawEdit && (
                <button
                  className="btn btn-secondary"
                  onClick={(event) => {
                    const trigger = event.currentTarget;
                    setActionError('');
                    void mutation.execute(
                      () => patchIncident(incident.id, { withdrawEditRequest: true }),
                      {
                        key: WORKSHOP_MUTATION_KEYS.WITHDRAW_EDIT,
                        successMessage: 'Demande de correction retirée.',
                        errorPresentation: 'local',
                        toErrorMessage: (error) =>
                          apiErrorMessage(error, 'Impossible de retirer la demande de correction.'),
                        onError: (_error, safeMessage) => {
                          setActionError(safeMessage);
                          requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
                        },
                      }
                    );
                  }}
                  disabled={mutation.pending}
                >
                  {mutation.isPending(WORKSHOP_MUTATION_KEYS.WITHDRAW_EDIT)
                    ? 'Retrait…'
                    : 'Retirer ma demande'}
                </button>
              )}
            </div>
          </DrawerSection>
        )}

        <DrawerSection title="Dossier">
          <div className="incident-detail-property-grid">
            <DetailField label="Marque machine">{incident.machine_brand}</DetailField>
            <DetailField label="Robot">{incident.robot_label}</DetailField>
            <DetailField label="Tête">{incident.head_number}</DetailField>
            <DetailField label="Produit en cours">
              {currentProduct || <span className="detail-value-muted">Non renseigné</span>}
            </DetailField>
            <DetailField label="Technicien">
              {takenByName ? (
                <>
                  {takenByName}
                  {incident.taken_by_role ? ` · ${formatRoleLabel(incident.taken_by_role)}` : ''}
                </>
              ) : (
                <span className="detail-value-muted">Aucun technicien</span>
              )}
            </DetailField>
            <DetailField label="Déclaré par">{creatorName}</DetailField>
            <DetailField label="Rôle créateur">{formatRoleLabel(incident.role)}</DetailField>
            <DetailField label="Création">{formatDateTime(incident.created_at)}</DetailField>
          </div>
        </DrawerSection>

        {hasNarrative && (
          <DrawerSection title="Suivi de l'incident">
            <div className="incident-narrative-list">
              <NarrativeItem label="Signalement initial" value={incident.comment} primary />
              <NarrativeItem label="Motif de mise en attente" value={waitingReason} />
              <NarrativeItem label="Diagnostic" value={incident.diagnostic} />
              <NarrativeItem label="Intervention" value={incident.intervention_note} />
            </div>
          </DrawerSection>
        )}

        {hasResponsibleInstruction && (
          <DrawerSection title="Consigne du responsable">
            {incident.responsible_comment && (
              <div className="incident-instruction-card">
                <p>{incident.responsible_comment}</p>
              </div>
            )}
            {canEditResponsibleComment && (
              <div className="incident-responsible-editor">
                <div className="form-group">
                  <label className="sr-only" htmlFor={`responsible-comment-detail-${incident.id}`}>
                    Consigne du responsable
                  </label>
                  <textarea
                    id={`responsible-comment-detail-${incident.id}`}
                    ref={responsibleInputRef}
                    className="form-input"
                    rows={3}
                    value={responsibleDraft}
                    onChange={(e) =>
                      setResponsibleDraft(e.target.value.slice(0, FIELD_LIMITS.COMMENT))
                    }
                    maxLength={FIELD_LIMITS.COMMENT}
                    disabled={mutation.pending}
                    placeholder="Consigne courte pour orienter le traitement"
                  />
                  <CharCounter current={responsibleDraft.length} max={FIELD_LIMITS.COMMENT} />
                </div>
                <div className="incident-action-row incident-action-row--compact">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setActionError('');
                      void mutation.execute(
                        () =>
                          patchIncident(incident.id, {
                            responsibleComment: responsibleDraft.trim(),
                          }),
                        {
                          key: WORKSHOP_MUTATION_KEYS.RESPONSIBLE_COMMENT,
                          successMessage: 'Consigne enregistrée.',
                          errorPresentation: 'local',
                          toErrorMessage: (error) =>
                            apiErrorMessage(error, "Impossible d'enregistrer la consigne."),
                          onError: (_error, safeMessage) => {
                            setActionError(safeMessage);
                            requestAnimationFrame(() =>
                              responsibleInputRef.current?.focus({
                                preventScroll: true,
                              })
                            );
                          },
                        }
                      );
                    }}
                    disabled={!responsibleDraft.trim() || mutation.pending}
                  >
                    {mutation.isPending(WORKSHOP_MUTATION_KEYS.RESPONSIBLE_COMMENT)
                      ? 'Enregistrement…'
                      : incident.responsible_comment
                        ? 'Enregistrer'
                        : 'Ajouter'}
                  </button>
                  {incident.responsible_comment && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => modal.setDeleteCommentConfirm(incident)}
                      disabled={mutation.pending}
                    >
                      Retirer la consigne
                    </button>
                  )}
                </div>
              </div>
            )}
          </DrawerSection>
        )}

        <DrawerSection title="Contexte machine">
          <div className="machine-context-actions">
            <button
              type="button"
              className="incident-context-link"
              onClick={() => navigate(`/workshop/knowledge?${machineContextQuery}`)}
            >
              Solutions déjà appliquées
            </button>
            <button
              type="button"
              className="incident-context-link"
              onClick={() => navigate(`/workshop/history?${machineContextQuery}`)}
            >
              Historique de la machine
            </button>
          </div>
        </DrawerSection>

        {hasDangerActions && (
          <DrawerSection title="Zone sensible" tone="danger">
            <div className="incident-action-row">
              {(canRequestCancel || canCancel) && (
                <button
                  className="btn btn-danger"
                  onClick={() =>
                    canCancel
                      ? modal.openModal('maintenanceDirect')
                      : modal.openModal('deleteRequest')
                  }
                  disabled={mutation.pending}
                >
                  {canCancel ? "Annuler l'incident" : "Demander l'annulation"}
                </button>
              )}
              {canWithdrawCancel && (
                <button
                  className="btn btn-secondary"
                  onClick={(event) => {
                    const trigger = event.currentTarget;
                    setActionError('');
                    void mutation.execute(
                      () => patchIncident(incident.id, { withdrawCancelRequest: true }),
                      {
                        key: WORKSHOP_MUTATION_KEYS.WITHDRAW_CANCEL,
                        successMessage: 'Demande d’annulation retirée.',
                        errorPresentation: 'local',
                        toErrorMessage: (error) =>
                          apiErrorMessage(error, "Impossible de retirer la demande d'annulation."),
                        onError: (_error, safeMessage) => {
                          setActionError(safeMessage);
                          requestAnimationFrame(() => trigger.focus({ preventScroll: true }));
                        },
                      }
                    );
                  }}
                  disabled={mutation.pending}
                >
                  {mutation.isPending(WORKSHOP_MUTATION_KEYS.WITHDRAW_CANCEL)
                    ? 'Retrait…'
                    : 'Retirer ma demande'}
                </button>
              )}
              {canInvalidateClosed && (
                <button
                  className="btn btn-danger"
                  onClick={() => modal.openModal('invalidate')}
                  disabled={mutation.pending}
                >
                  Invalider
                </button>
              )}
            </div>
          </DrawerSection>
        )}
      </div>

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
      {modal.state.activeModal === 'maintenanceDirect' && (
        <MaintenanceDeleteConfirmModal
          incident={incident}
          title="Annuler l'incident"
          error={modal.state.reviewError}
          onClose={() => modal.closeModal()}
          onConfirm={onMaintenanceDeleteConfirm}
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
