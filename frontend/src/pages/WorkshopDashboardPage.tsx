import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateIncidentModal from '../components/CreateIncidentModal';
import DeleteRequestModal from '../components/DeleteRequestModal';
import MaintenanceDeleteConfirmModal from '../components/MaintenanceDeleteConfirmModal';
import ReviewIncidentRequestModal from '../components/ReviewIncidentRequestModal';
import TakeChargeConfirmModal from '../components/TakeChargeConfirmModal';
import PendingConfirmModal from '../components/PendingConfirmModal';
import CloseIncidentModal from '../components/CloseIncidentModal';
import {
  deleteWorkshopIncident,
  getIncidentMetrics,
  listWorkshopIncidents,
  listWorkshopLines,
  updateWorkshopIncident,
} from '../api/workshop';
import { useWorkshopAuth } from '../routes/WorkshopAuthContext';
import { ProductionLine, WorkshopIncident, WorkshopIncidentMetrics } from '../types';

const ROLE_LABELS: Record<string, string> = {
  OPERATOR: 'Opérateur',
  MAINTENANCE: 'Maintenance',
  RESPONSABLE: 'Responsable',
};

const SHIFT_LABELS: Record<string, string> = {
  MATIN: 'Matin',
  APRES_MIDI: 'Après midi',
  NUIT: 'Nuit',
  WEEKEND: 'Weekend',
};

const STATE_LABELS: Record<string, string> = {
  SKIPEE_PAR_MACHINE: 'Skipée par machine',
  SKIPEE_PAR_CONDUCTEUR: 'Skipée par conducteur',
  DEGRADEE: 'Dégradée',
  INDISPONIBLE: 'Indisponible',
  AUTRE: 'Autre',
};


function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}


export default function WorkshopDashboardPage() {
  const { user, logout } = useWorkshopAuth();
  const navigate = useNavigate();
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDeleteRequest, setShowDeleteRequest] = useState(false);
  const [showTakeChargeConfirm, setShowTakeChargeConfirm] = useState(false);
  const [showPendingConfirm, setShowPendingConfirm] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [showMaintenanceDeleteConfirm, setShowMaintenanceDeleteConfirm] = useState(false);
  const [maintenanceDeleteMode, setMaintenanceDeleteMode] = useState<'direct' | 'approve' | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<WorkshopIncident | null>(null);
  const [reviewIncident, setReviewIncident] = useState<WorkshopIncident | null>(null);
  const [reviewType, setReviewType] = useState<'edit' | 'delete' | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [responsibleDrafts, setResponsibleDrafts] = useState<Record<number, string>>({});
  const [metrics, setMetrics] = useState<WorkshopIncidentMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [filters, setFilters] = useState({
    lineId: 'all',
    status: 'all',
    priority: 'all',
    taken: 'all',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const canAct = Boolean(user);
  const isOperator = user?.role === 'OPERATOR';
  const isMaintenance = user?.role === 'MAINTENANCE';
  const isResponsable = user?.role === 'RESPONSABLE';

  function sortIncidents(items: WorkshopIncident[]): WorkshopIncident[] {
    return [...items].sort((a, b) => {
      if (a.display_order !== b.display_order) {
        return b.display_order - a.display_order;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([listWorkshopLines(), listWorkshopIncidents()])
      .then(([lineData, incidentData]) => {
        setLines(lineData);
        setIncidents(sortIncidents(incidentData));
      })
      .catch(() => setError('Impossible de charger le tableau de bord.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setMetricsLoading(true);
    getIncidentMetrics()
      .then(setMetrics)
      .catch(() => setMetrics(null))
      .finally(() => setMetricsLoading(false));
  }, []);

  async function handleLogout() {
    await logout();
    navigate('/workshop', { replace: true });
  }

  async function patchIncident(id: number, payload: Parameters<typeof updateWorkshopIncident>[1]) {
    const updated = await updateWorkshopIncident(id, payload);
    setIncidents((prev) =>
      sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
    );
    setSelectedIncident(updated);
  }

  function upsertIncident(updated: WorkshopIncident) {
    setIncidents((prev) =>
      sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
    );
    setSelectedIncident((prev) => (prev?.id === updated.id ? updated : prev));
  }

  function openReview(incident: WorkshopIncident, type: 'edit' | 'delete') {
    setReviewIncident(incident);
    setReviewType(type);
    setReviewError('');
  }

  function closeReview() {
    setReviewIncident(null);
    setReviewType(null);
    setReviewError('');
    setReviewLoading(false);
  }

  async function handleDeleteIncident(id: number) {
    await deleteWorkshopIncident(id);
    setIncidents((prev) => sortIncidents(prev.filter((item) => item.id !== id)));
    setSelectedIncident(null);
  }

  function openMaintenanceDeleteConfirm(mode: 'direct' | 'approve') {
    setMaintenanceDeleteMode(mode);
    setShowMaintenanceDeleteConfirm(true);
  }

  async function handleConfirmTakeCharge() {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { isTaken: true });
    setShowTakeChargeConfirm(false);
  }

  async function handleRequestDelete(reason: string) {
    if (!selectedIncident) return;
    const updated = await updateWorkshopIncident(selectedIncident.id, {
      deleteRequest: true,
      deleteRequestReason: reason,
    });
    upsertIncident(updated);
    setShowDeleteRequest(false);
  }

  async function handleApplyEditRequest() {
    if (!reviewIncident) return;
    if (isMaintenance && reviewIncident.is_taken) {
      setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    setReviewLoading(true);
    setReviewError('');
    try {
      const updated = await updateWorkshopIncident(reviewIncident.id, { applyEditRequest: true });
      upsertIncident(updated);
      closeReview();
    } catch (err) {
      setReviewError('Impossible d\'appliquer la modification.');
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleRejectEditRequest() {
    if (!reviewIncident) return;
    if (isMaintenance && reviewIncident.is_taken) {
      setReviewError('Modification interdite apres prise en charge.');
      return;
    }
    setReviewLoading(true);
    setReviewError('');
    try {
      const updated = await updateWorkshopIncident(reviewIncident.id, { rejectEditRequest: true });
      upsertIncident(updated);
      closeReview();
    } catch (err) {
      setReviewError('Impossible de refuser la modification.');
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleApproveDeleteRequest() {
    if (!reviewIncident) return;
    if (isMaintenance && !reviewIncident.is_taken) {
      openMaintenanceDeleteConfirm('approve');
      return;
    }
    setReviewLoading(true);
    setReviewError('');
    try {
      await deleteWorkshopIncident(reviewIncident.id);
      setIncidents((prev) => sortIncidents(prev.filter((item) => item.id !== reviewIncident.id)));
      if (selectedIncident?.id === reviewIncident.id) setSelectedIncident(null);
      closeReview();
    } catch (err) {
      setReviewError('Impossible de supprimer l\'incident.');
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleRejectDeleteRequest() {
    if (!reviewIncident) return;
    setReviewLoading(true);
    setReviewError('');
    try {
      const updated = await updateWorkshopIncident(reviewIncident.id, { rejectDeleteRequest: true });
      upsertIncident(updated);
      closeReview();
    } catch (err) {
      setReviewError('Impossible de refuser la suppression.');
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleSetPending(reason: string) {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { status: 'PENDING', diagnostic: reason.trim() });
    setShowPendingConfirm(false);
  }

  async function handleResumeIncident() {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { status: 'OPEN' });
  }

  async function handleCloseIncident(note: string) {
    if (!selectedIncident) return;
    await patchIncident(selectedIncident.id, { status: 'CLOSED', interventionNote: note.trim() });
    setShowCloseConfirm(false);
  }


  function getResponsibleDraft(incident: WorkshopIncident): string {
    if (Object.prototype.hasOwnProperty.call(responsibleDrafts, incident.id)) {
      return responsibleDrafts[incident.id] ?? '';
    }
    return incident.responsible_comment || '';
  }

  function updateResponsibleDraft(id: number, value: string) {
    setResponsibleDrafts((prev) => ({ ...prev, [id]: value }));
  }

  async function saveResponsibleComment(incident: WorkshopIncident) {
    const value = getResponsibleDraft(incident).trim();
    if (!value) return;
    const updated = await updateWorkshopIncident(incident.id, { responsibleComment: value });
    upsertIncident(updated);
    setResponsibleDrafts((prev) => {
      const next = { ...prev };
      delete next[incident.id];
      return next;
    });
  }

  async function deleteResponsibleComment(incident: WorkshopIncident) {
    const updated = await updateWorkshopIncident(incident.id, { responsibleComment: '' });
    upsertIncident(updated);
    setResponsibleDrafts((prev) => {
      const next = { ...prev };
      delete next[incident.id];
      return next;
    });
  }

  async function handleToggleUrgent(incident: WorkshopIncident) {
    const updated = await updateWorkshopIncident(incident.id, { isPriority: !incident.is_priority });
    upsertIncident(updated);
  }

  async function moveIncident(id: number, direction: 'up' | 'down') {
    const index = filteredIncidents.findIndex((item) => item.id === id);
    if (index === -1) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= filteredIncidents.length) return;
    const current = filteredIncidents[index];
    const target = filteredIncidents[targetIndex];
    const currentOrder = current.display_order;
    const targetOrder = target.display_order;

    setIncidents((prev) =>
      prev.map((item) => {
        if (item.id === current.id) return { ...item, display_order: targetOrder };
        if (item.id === target.id) return { ...item, display_order: currentOrder };
        return item;
      })
    );

    await updateWorkshopIncident(current.id, { displayOrder: targetOrder });
    await updateWorkshopIncident(target.id, { displayOrder: currentOrder });
  }

  const filteredIncidents = incidents.filter((incident) => {
    if (filters.lineId !== 'all' && String(incident.line_id) !== filters.lineId) return false;
    if (filters.status !== 'all' && incident.status !== filters.status) return false;
    if (filters.priority === 'urgent' && !incident.is_priority) return false;
    if (filters.priority === 'normal' && incident.is_priority) return false;
    if (filters.taken === 'taken' && !incident.is_taken) return false;
    if (filters.taken === 'not_taken' && incident.is_taken) return false;
    return true;
  });

  async function handleMaintenanceDeleteConfirm() {
    if (maintenanceDeleteMode === 'approve' && reviewIncident) {
      await deleteWorkshopIncident(reviewIncident.id);
      setIncidents((prev) => sortIncidents(prev.filter((item) => item.id !== reviewIncident.id)));
      if (selectedIncident?.id === reviewIncident.id) setSelectedIncident(null);
      closeReview();
    }
    if (maintenanceDeleteMode === 'direct' && selectedIncident) {
      await deleteWorkshopIncident(selectedIncident.id);
      setIncidents((prev) => sortIncidents(prev.filter((item) => item.id !== selectedIncident.id)));
      setSelectedIncident(null);
    }
    setShowMaintenanceDeleteConfirm(false);
    setMaintenanceDeleteMode(null);
  }

  if (selectedIncident) {
    return (
      <main className="page-container">
        <button className="back-link" onClick={() => setSelectedIncident(null)}>
          ← Retour au dashboard
        </button>

        <div className="page-header">
          <h1>Incident {selectedIncident.line_number} · {selectedIncident.machine_id}</h1>
          {canAct && (
            <div className="action-bar" style={{ marginTop: 0 }}>
              {(isMaintenance || isResponsable || isOperator) && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowEdit(true)}
                  disabled={isMaintenance && selectedIncident.is_taken}
                >
                  {isOperator ? 'Demander une modification' : 'Modifier'}
                </button>
              )}
              {isMaintenance && (
                <button
                  className={selectedIncident.is_taken ? 'btn btn-secondary' : 'btn btn-primary'}
                  onClick={() => setShowTakeChargeConfirm(true)}
                  disabled={selectedIncident.is_taken}
                >
                  {selectedIncident.is_taken ? 'Pris en charge' : 'Prendre en charge'}
                </button>
              )}
              {(isMaintenance || isResponsable || isOperator) && (
                <button
                  className="btn btn-danger"
                  onClick={() =>
                    isResponsable
                      ? handleDeleteIncident(selectedIncident.id)
                      : isMaintenance
                        ? (selectedIncident.is_taken
                          ? undefined
                          : openMaintenanceDeleteConfirm('direct'))
                        : setShowDeleteRequest(true)
                  }
                  disabled={isMaintenance && selectedIncident.is_taken}
                >
                  {isResponsable ? 'Supprimer' : isMaintenance ? 'Supprimer' : 'Demander suppression'}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-body">
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Utilisateur</span>
                <span className="detail-field-value">{selectedIncident.first_name} {selectedIncident.last_name}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Badge</span>
                <span className="detail-field-value">{selectedIncident.badge_number}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Équipe</span>
                <span className="detail-field-value">{SHIFT_LABELS[selectedIncident.shift]}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">État</span>
                <span className="detail-field-value">{STATE_LABELS[selectedIncident.state]}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Ligne</span>
                <span className="detail-field-value">{selectedIncident.line_number}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Machine</span>
                <span className="detail-field-value">{selectedIncident.machine_id} · {selectedIncident.machine_brand}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Robot</span>
                <span className="detail-field-value">{selectedIncident.robot_label}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Tête</span>
                <span className="detail-field-value">{selectedIncident.head_number}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Prise en charge</span>
                <span className="detail-field-value">{selectedIncident.is_taken ? 'Oui' : 'Non'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Pris en charge par</span>
                <span className="detail-field-value">
                  {selectedIncident.taken_by_first_name
                    ? `${selectedIncident.taken_by_first_name} ${selectedIncident.taken_by_last_name || ''}`.trim()
                    : '-'}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Priorité</span>
                <span className="detail-field-value">{selectedIncident.is_priority ? 'Oui' : 'Non'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Statut</span>
                <span className="detail-field-value">{selectedIncident.status}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Produit en cours</span>
                <span className="detail-field-value">{selectedIncident.current_product || '-'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Création</span>
                <span className="detail-field-value">{formatDateTime(selectedIncident.created_at)}</span>
              </div>
            </div>
            {selectedIncident.comment && (
              <p className="incident-comment">{selectedIncident.comment}</p>
            )}
            {selectedIncident.diagnostic && (
              <p className="incident-comment"><strong>Diagnostic :</strong> {selectedIncident.diagnostic}</p>
            )}
            {selectedIncident.intervention_note && (
              <p className="incident-comment"><strong>Intervention :</strong> {selectedIncident.intervention_note}</p>
            )}
            {selectedIncident.edit_request && (
              <div className="notice" style={{ marginTop: 16 }}>Demande de modification opérateur en attente.</div>
            )}
            {selectedIncident.delete_request && (
              <div className="notice" style={{ marginTop: 16 }}>Demande de suppression opérateur en attente.</div>
            )}
          </div>
        </div>


        {canAct && (isMaintenance || isResponsable) && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-body">
              <div className="action-bar">
                {isMaintenance && (
                  <>
                    {selectedIncident.status === 'PENDING' ? (
                      <button
                        className="btn btn-secondary"
                        onClick={handleResumeIncident}
                        disabled={!selectedIncident.is_taken}
                      >
                        Reprendre
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setShowPendingConfirm(true)}
                        disabled={!selectedIncident.is_taken}
                      >
                        Mettre en attente
                      </button>
                    )}
                    <button
                      className="btn btn-primary"
                      onClick={() => setShowCloseConfirm(true)}
                      disabled={!selectedIncident.is_taken || selectedIncident.status === 'PENDING'}
                    >
                      Clôturer
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {showEdit && (
          <CreateIncidentModal
            lines={lines}
            incident={selectedIncident}
            onClose={() => setShowEdit(false)}
            onSuccess={(updated) => {
              setShowEdit(false);
              setSelectedIncident(updated);
              setIncidents((prev) =>
                sortIncidents(prev.map((item) => (item.id === updated.id ? updated : item)))
              );
            }}
            requestOnly={isOperator}
          />
        )}

        {showDeleteRequest && selectedIncident && (
          <DeleteRequestModal
            incident={selectedIncident}
            onClose={() => setShowDeleteRequest(false)}
            onConfirm={handleRequestDelete}
          />
        )}

        {showTakeChargeConfirm && selectedIncident && (
          <TakeChargeConfirmModal
            incident={selectedIncident}
            onClose={() => setShowTakeChargeConfirm(false)}
            onConfirm={handleConfirmTakeCharge}
          />
        )}

        {showPendingConfirm && selectedIncident && (
          <PendingConfirmModal
            incident={selectedIncident}
            onClose={() => setShowPendingConfirm(false)}
            onConfirm={handleSetPending}
          />
        )}

        {showCloseConfirm && selectedIncident && (
          <CloseIncidentModal
            incident={selectedIncident}
            onClose={() => setShowCloseConfirm(false)}
            onConfirm={handleCloseIncident}
          />
        )}

        {reviewIncident && reviewType && (
          <ReviewIncidentRequestModal
            incident={reviewIncident}
            lines={lines}
            type={reviewType}
            loading={reviewLoading}
            error={reviewError}
            onClose={closeReview}
            onApplyEdit={handleApplyEditRequest}
            onRejectEdit={handleRejectEditRequest}
            onApproveDelete={handleApproveDeleteRequest}
            onRejectDelete={handleRejectDeleteRequest}
            allowDeleteApproval={isResponsable || isMaintenance}
            allowDeleteReject={isResponsable}
            deleteApprovalDisabled={isMaintenance && reviewIncident.is_taken}
            deleteWarning={
              isMaintenance && !reviewIncident.is_taken
                ? "Vous n'avez pas le droit de supprimer un signalement ou valider sa suppression sans prise en charge sauf erreur de signalement."
                : undefined
            }
            allowEditApply={!(isMaintenance && reviewIncident.is_taken)}
            allowEditReject={!(isMaintenance && reviewIncident.is_taken)}
            editDisabled={isMaintenance && reviewIncident.is_taken}
            editWarning={
              isMaintenance && reviewIncident.is_taken
                ? 'Modification interdite apres prise en charge.'
                : undefined
            }
          />
        )}

        {showMaintenanceDeleteConfirm && (selectedIncident || reviewIncident) && (
          <MaintenanceDeleteConfirmModal
            incident={maintenanceDeleteMode === 'approve' ? reviewIncident! : selectedIncident!}
            title={maintenanceDeleteMode === 'approve' ? 'Valider la suppression' : 'Supprimer l\'incident'}
            onClose={() => {
              setShowMaintenanceDeleteConfirm(false);
              setMaintenanceDeleteMode(null);
              setReviewLoading(false);
            }}
            onConfirm={handleMaintenanceDeleteConfirm}
          />
        )}
      </main>
    );
  }

  return (
    <main className="page-container">
      <div className="page-header">
        <h1>Workshop dashboard</h1>
        <div className="action-bar" style={{ marginTop: 0 }}>
          {user && (
            <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
              + Créer un incident
            </button>
          )}
          {user && (
            <button className="btn btn-secondary" onClick={() => navigate('/workshop/history')}>
              Historique
            </button>
          )}
          {user ? (
            <button className="btn btn-secondary" onClick={handleLogout}>
              Se déconnecter
            </button>
          ) : (
            <button className="btn btn-secondary" onClick={() => navigate('/workshop')}>
              Se connecter
            </button>
          )}
        </div>
      </div>

      {user ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body">
            <div className="detail-grid">
              <div className="detail-field">
                <span className="detail-field-label">Utilisateur</span>
                <span className="detail-field-value">{user.first_name} {user.last_name}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Badge</span>
                <span className="detail-field-value">{user.badge_number}</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Rôle</span>
                <span className="detail-field-value">
                  <span className="badge-role">{ROLE_LABELS[user.role] || user.role}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="notice" style={{ marginBottom: 20 }}>
          Lecture seule : connectez-vous pour créer ou agir sur un incident.
        </div>
      )}

      {error && <div className="error-message" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="detail-grid">
            {metricsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <span className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} />
              </div>
            ) : metrics ? (
              <>
                <div className="detail-field">
                  <span className="detail-field-label">Total</span>
                  <span className="detail-field-value">{metrics.total}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field-label">Ouverts</span>
                  <span className="detail-field-value">{metrics.open}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field-label">En attente</span>
                  <span className="detail-field-value">{metrics.pending}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field-label">Clotures</span>
                  <span className="detail-field-value">{metrics.closed}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field-label">Ouverts &gt; 7j</span>
                  <span className="detail-field-value">{metrics.open_over_7d}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-field-label">Mediane prise en charge</span>
                  <span className="detail-field-value">
                    {metrics.median_take_seconds
                      ? `${Math.round(metrics.median_take_seconds / 3600)} h`
                      : '-'}
                  </span>
                </div>
              </>
            ) : (
              <div className="empty-state">KPI indisponibles.</div>
            )}
          </div>
        </div>
      </div>

      <div className="filters-row" style={{ marginBottom: 16 }}>
        <div className="filter-group">
          <span className="filter-label">Ligne</span>
          <select
            className="form-select"
            value={filters.lineId}
            onChange={(event) => setFilters((prev) => ({ ...prev, lineId: event.target.value }))}
          >
            <option value="all">Toutes</option>
            {lines.map((line) => (
              <option key={line.id} value={String(line.id)}>
                {line.line_number}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Statut</span>
          <select
            className="form-select"
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
          >
            <option value="all">Tous</option>
            <option value="OPEN">Ouvert</option>
            <option value="PENDING">En attente</option>
            <option value="CLOSED">Cloture</option>
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Priorite</span>
          <select
            className="form-select"
            value={filters.priority}
            onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}
          >
            <option value="all">Toutes</option>
            <option value="urgent">Urgent</option>
            <option value="normal">Normal</option>
          </select>
        </div>
        <div className="filter-group">
          <span className="filter-label">Prise en charge</span>
          <select
            className="form-select"
            value={filters.taken}
            onChange={(event) => setFilters((prev) => ({ ...prev, taken: event.target.value }))}
          >
            <option value="all">Toutes</option>
            <option value="taken">Prises en charge</option>
            <option value="not_taken">Non prises</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
        </div>
      ) : filteredIncidents.length === 0 ? (
        <div className="card">
          <div className="empty-state">Aucun incident créé.</div>
        </div>
      ) : (
        <div className="incident-list">
          {filteredIncidents.map((incident) => (
            <article
              className={`incident-card${incident.is_priority ? ' incident-card--urgent' : ''}`}
              key={incident.id}
              onClick={() => {
                setSelectedIncident(incident);
                if ((isResponsable || isMaintenance) && incident.delete_request) {
                  openReview(incident, 'delete');
                  return;
                }
                if ((isMaintenance || isResponsable) && incident.edit_request) {
                  openReview(incident, 'edit');
                }
              }}
            >
              <div className="incident-card-main">
                <div>
                  <span className="detail-field-label">Incident</span>
                  <h2>{incident.line_number} · {incident.machine_id}</h2>
                </div>
                <span className="badge-role">{STATE_LABELS[incident.state] || incident.state}</span>
              </div>
              <div className="incident-tags">
                {incident.is_priority && <span className="badge-status inactive">Prioritaire</span>}
                {incident.is_taken && <span className="badge-status active">Pris en charge</span>}
                {isResponsable && (
                  <div className="incident-order-controls">
                    <button
                      type="button"
                      className="incident-order-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        void moveIncident(incident.id, 'up');
                      }}
                      disabled={filteredIncidents[0]?.id === incident.id}
                      aria-label="Monter l'incident"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="incident-order-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        void moveIncident(incident.id, 'down');
                      }}
                      disabled={filteredIncidents[filteredIncidents.length - 1]?.id === incident.id}
                      aria-label="Descendre l'incident"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      className="incident-urgent-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleToggleUrgent(incident);
                      }}
                    >
                      {incident.is_priority ? 'Urgent' : 'Déclarer urgent'}
                    </button>
                  </div>
                )}
                {(isMaintenance || isResponsable) && incident.edit_request && (
                  <button
                    type="button"
                    className="request-badge request-badge-edit"
                    onClick={(event) => {
                      event.stopPropagation();
                      openReview(incident, 'edit');
                    }}
                  >
                    Modification demandée
                  </button>
                )}
                {(isResponsable || isMaintenance) && incident.delete_request && (
                  <button
                    type="button"
                    className="request-badge request-badge-delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      openReview(incident, 'delete');
                    }}
                  >
                    Suppression demandée
                  </button>
                )}
              </div>

              <div className="incident-card-grid">
                <div>
                  <span className="detail-field-label">Utilisateur</span>
                  <strong>{incident.first_name} {incident.last_name}</strong>
                  <p>{incident.badge_number} · {ROLE_LABELS[incident.role] || incident.role}</p>
                </div>
                <div>
                  <span className="detail-field-label">Équipe</span>
                  <strong>{SHIFT_LABELS[incident.shift] || incident.shift}</strong>
                  <p>{formatDateTime(incident.created_at)}</p>
                </div>
                <div>
                  <span className="detail-field-label">Robot</span>
                  <strong>{incident.robot_label}</strong>
                  <p>Tête {incident.head_number}</p>
                </div>
                <div>
                  <span className="detail-field-label">Produit</span>
                  <strong>{incident.current_product || '-'}</strong>
                  <p>{incident.machine_brand}</p>
                </div>
                <div>
                  <span className="detail-field-label">Pris en charge par</span>
                  <strong>
                    {incident.taken_by_first_name
                      ? `${incident.taken_by_first_name} ${incident.taken_by_last_name || ''}`.trim()
                      : '-'}
                  </strong>
                  <p>{incident.taken_by_badge_number || '-'}</p>
                </div>
              </div>

              {incident.status === 'PENDING' && incident.diagnostic && (
                <div className="notice" style={{ marginTop: 12 }}>
                  Attente justifiee : {incident.diagnostic}
                </div>
              )}

              {isResponsable && (
                <div className="incident-comment">
                  <div className="form-group">
                    <label className="form-label" htmlFor={`responsible-comment-${incident.id}`}>
                      Consigne responsable
                    </label>
                    <textarea
                      id={`responsible-comment-${incident.id}`}
                      className="form-input"
                      rows={2}
                      value={getResponsibleDraft(incident)}
                      onChange={(event) => updateResponsibleDraft(incident.id, event.target.value)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </div>
                  <div className="action-bar" onClick={(event) => event.stopPropagation()}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => saveResponsibleComment(incident)}
                      disabled={!getResponsibleDraft(incident).trim()}
                    >
                      {incident.responsible_comment ? 'Mettre a jour' : 'Ajouter'}
                    </button>
                    {incident.responsible_comment && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => deleteResponsibleComment(incident)}
                      >
                        Supprimer
                      </button>
                    )}
                  </div>
                </div>
              )}
              {!isResponsable && incident.responsible_comment && (
                <p className="incident-comment">{incident.responsible_comment}</p>
              )}
            </article>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateIncidentModal
          lines={lines}
          onClose={() => setShowCreate(false)}
          onSuccess={(incident) => {
            setShowCreate(false);
              setIncidents((prev) => sortIncidents([incident, ...prev]));
          }}
        />
      )}
    </main>
  );
}
