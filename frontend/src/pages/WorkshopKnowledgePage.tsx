import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import { useMutationFeedback } from '../components/ui/MutationFeedback';
import Skeleton from '../components/ui/Skeleton';
import WorkshopNavBar from '../components/WorkshopNavBar';
import WorkshopFilterCard from '../components/WorkshopFilterCard';
import { WorkshopIncident } from '../types';
import { formatDateTime } from '../utils/workshopHistory';
import { formatStateLabel } from '../utils/labels';
import { formatElapsed } from '../utils/date';
import {
  lineFilterChip,
  machineFilterChip,
  searchFilterChip,
  stateFilterChip,
} from '../utils/workshopFilters';
import { usePageTitle } from '../hooks/usePageTitle';
import { useKnowledgeData } from '../hooks/useKnowledgeData';

// ── Couleurs par type d'anomalie ───────────────────────────────────
const STATE_TONE: Record<string, string> = {
  SKIPEE_PAR_MACHINE: 'kb-state-machine',
  SKIPEE_PAR_CONDUCTEUR: 'kb-state-conducteur',
  DEGRADEE: 'kb-state-degradee',
  INDISPONIBLE: 'kb-state-indisponible',
};

function stateToneClass(state: string): string {
  return STATE_TONE[state] ?? 'kb-state-default';
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

// ── Composant carte liste ──────────────────────────────────────────
type KnowledgeCardProps = {
  incident: WorkshopIncident;
  active: boolean;
  onClick: () => void;
};

function KnowledgeCard({ incident, active, onClick }: KnowledgeCardProps) {
  const preview = incident.intervention_note || incident.diagnostic || incident.comment;
  return (
    <button
      type="button"
      className={`kb-card${active ? ' kb-card-active' : ''}`}
      aria-current={active ? 'true' : undefined}
      onClick={onClick}
    >
      <div className="kb-card-top">
        <span className={`kb-state-badge ${stateToneClass(incident.state)}`}>
          {formatStateLabel(incident.state)}
        </span>
        <span className="kb-card-date">{shortDate(incident.updated_at)}</span>
      </div>
      <span className="kb-card-title">
        Ligne {incident.line_number} · {incident.machine_id}
      </span>
      <span className="kb-card-context">
        {incident.robot_label} · Tête {incident.head_number}
        {incident.current_product ? ` · ${incident.current_product}` : ''}
      </span>
      {preview && <span className="kb-card-preview">{preview}</span>}
    </button>
  );
}

// ── Composant détail ───────────────────────────────────────────────
type KnowledgeDetailProps = {
  incident: WorkshopIncident;
  related: WorkshopIncident[];
  onSelectRelated: (id: number) => void;
  onViewHistory: () => void;
  onCopyLink: () => void;
  copied: boolean;
};

function KnowledgeDetail({
  incident,
  related,
  onSelectRelated,
  onViewHistory,
  onCopyLink,
  copied,
}: KnowledgeDetailProps) {
  const resTime = formatElapsed(incident.created_at, incident.updated_at);
  const technician = incident.taken_by_first_name
    ? `${incident.taken_by_first_name} ${incident.taken_by_last_name ?? ''}`.trim()
    : null;

  return (
    <article className="kb-detail">
      {/* En-tête */}
      <div className="kb-detail-header">
        <div className="kb-detail-header-left">
          <span className="detail-field-label">Fiche intervention</span>
          <h2 className="kb-detail-title">
            Ligne {incident.line_number} · {incident.machine_id}
          </h2>
        </div>
        <span className={`kb-state-badge kb-state-badge-lg ${stateToneClass(incident.state)}`}>
          {formatStateLabel(incident.state)}
        </span>
      </div>

      {/* Méta-données */}
      <div className="kb-meta-grid">
        <div className="kb-meta-item">
          <span className="detail-field-label">Équipement</span>
          <strong>
            {incident.robot_label} · Tête {incident.head_number}
          </strong>
          <span className="kb-meta-sub">{incident.machine_brand}</span>
        </div>
        <div className="kb-meta-item">
          <span className="detail-field-label">Produit</span>
          <strong>{incident.current_product || '—'}</strong>
        </div>
        <div className="kb-meta-item">
          <span className="detail-field-label">Résolu le</span>
          <strong>{formatDateTime(incident.updated_at)}</strong>
        </div>
        <div className="kb-meta-item">
          <span className="detail-field-label">Durée résolution</span>
          <strong>{resTime}</strong>
        </div>
        <div className="kb-meta-item">
          <span className="detail-field-label">Technicien</span>
          <strong>{technician || '—'}</strong>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="kb-sections">
        {incident.comment && (
          <div className="kb-section">
            <span className="detail-field-label">Symptôme observé</span>
            <p>{incident.comment}</p>
          </div>
        )}

        {incident.diagnostic?.trim() && (
          <div className="kb-section">
            <span className="detail-field-label">Diagnostic</span>
            <p>{incident.diagnostic}</p>
          </div>
        )}

        <div className="kb-section kb-section-solution">
          <span className="detail-field-label">Solution / intervention validée</span>
          <p>{incident.intervention_note || '—'}</p>
        </div>

        {incident.responsible_comment && (
          <div className="kb-section kb-section-instruction">
            <span className="detail-field-label">Consigne du responsable</span>
            <p>{incident.responsible_comment}</p>
          </div>
        )}
      </div>

      {/* Cas similaires — tisse la mémoire collective et nourrit le modèle mental (P5) */}
      {related.length > 0 && (
        <div className="kb-related">
          <span className="detail-field-label">Déjà résolu ailleurs</span>
          <p className="kb-related-intro">
            Mêmes équipement ou anomalie — comment l'atelier s'en est sorti.
          </p>
          <ul className="kb-related-list">
            {related.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="kb-related-item"
                  onClick={() => onSelectRelated(r.id)}
                >
                  <span className={`kb-state-badge ${stateToneClass(r.state)}`}>
                    {formatStateLabel(r.state)}
                  </span>
                  <span className="kb-related-where">
                    Ligne {r.line_number} · {r.machine_id}
                  </span>
                  {r.intervention_note && (
                    <span className="kb-related-preview">{r.intervention_note}</span>
                  )}
                  <span className="kb-related-date">{shortDate(r.updated_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="kb-actions">
        <button type="button" className="btn btn-outline" onClick={onViewHistory}>
          Trace historique
        </button>
        <button type="button" className="btn btn-outline" onClick={onCopyLink}>
          {copied ? 'Lien copié !' : 'Copier le lien'}
        </button>
      </div>
    </article>
  );
}

// ── Page principale ────────────────────────────────────────────────
export default function WorkshopKnowledgePage() {
  usePageTitle('Base de connaissance');
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  const copyResetTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const { notifyError } = useMutationFeedback();

  const {
    incidents,
    lines,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    error,
    query,
    lineFilter,
    machineFilter,
    stateFilter,
    selectedId,
    selectedIncident,
    relatedIncidents,
    machineCount,
    lastItem,
    setQuery,
    setMachineFilter,
    setStateFilter,
    updateSearchFilter,
    updateLineFilter,
    selectIncident: selectIncidentData,
    clearFilters,
  } = useKnowledgeData();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (copyResetTimerRef.current !== null) {
        window.clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
    };
  }, []);

  // Chips de filtres actifs
  const filterChips: FilterChip[] = [
    ...searchFilterChip(query, () => {
      setQuery('');
      updateSearchFilter('q', '', '');
    }),
    ...lineFilterChip(lines, lineFilter, () => updateLineFilter('all')),
    ...machineFilterChip(machineFilter, () => {
      setMachineFilter('all');
      updateSearchFilter('machine', 'all');
    }),
    ...stateFilterChip(stateFilter, () => {
      setStateFilter('all');
      updateSearchFilter('state', 'all');
    }),
  ];

  // Suggestion de filtre à supprimer pour état vide
  const emptyHint =
    !loading && incidents.length === 0
      ? filterChips.length > 0
        ? 'Essayez de supprimer un filtre actif.'
        : 'Aucune intervention documentée pour le moment.'
      : null;

  function selectIncident(id: number): void {
    selectIncidentData(id);
    // Scroll vers le détail sur mobile
    setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function copyLink(): void {
    const url = `${window.location.origin}${window.location.pathname}?incident=${selectedId}`;
    void Promise.resolve()
      .then(() => navigator.clipboard.writeText(url))
      .then(
        () => {
          if (!mountedRef.current) return;
          if (copyResetTimerRef.current !== null) {
            window.clearTimeout(copyResetTimerRef.current);
          }
          setCopied(true);
          copyResetTimerRef.current = window.setTimeout(() => {
            copyResetTimerRef.current = null;
            setCopied(false);
          }, 2000);
        },
        () => {
          if (!mountedRef.current) return;
          notifyError(
            'Impossible de copier le lien. Vérifiez les permissions du navigateur et réessayez.',
            'copy-knowledge-link'
          );
        }
      );
  }

  return (
    <>
      <WorkshopNavBar />
      <main id="main-content" className="page-container workshop-page">
        <button className="back-link" onClick={() => navigate('/workshop/dashboard')}>
          Retour au dashboard
        </button>

        <div className="page-header">
          <div>
            <h1>Base de connaissance</h1>
            {!loading && incidents.length > 0 && (
              <p className="kb-memory-line">
                {incidents.length} intervention{incidents.length !== 1 ? 's' : ''}
                {hasMore ? ' chargée' : ' documentée'}
                {incidents.length !== 1 ? 's' : ''} sur {machineCount} machine
                {machineCount !== 1 ? 's' : ''} — la mémoire de l'atelier
                {hasMore ? ', d’autres restent à charger' : ''}.
              </p>
            )}
          </div>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        <WorkshopFilterCard
          searchInputId="knowledge-search"
          searchPlaceholder="Symptôme, solution, machine, produit..."
          query={query}
          onQueryChange={(v) => {
            setQuery(v);
            updateSearchFilter('q', v, '');
          }}
          lines={lines}
          lineFilter={lineFilter}
          onLineFilterChange={updateLineFilter}
          machineFilter={machineFilter}
          onMachineFilterChange={(v) => {
            setMachineFilter(v);
            updateSearchFilter('machine', v);
          }}
          stateFilter={stateFilter}
          onStateFilterChange={(v) => {
            setStateFilter(v);
            updateSearchFilter('state', v);
          }}
          count={incidents.length}
          countLabel={{ singular: 'fiche affichée', plural: 'fiches affichées' }}
          chips={filterChips}
          onClear={clearFilters}
          emptyText="Base complète"
        />

        {/* ── Layout master-detail ── */}
        <div className="kb-layout">
          {/* Colonne liste */}
          <div className="kb-list-col">
            <div className="kb-list-header">
              <span className="detail-field-label">
                {loading
                  ? 'Chargement…'
                  : `${incidents.length} fiche${incidents.length !== 1 ? 's' : ''}`}
              </span>
              <div className="kb-list-meta">
                {!loading && incidents.length > 0 && (
                  <>
                    <span>
                      {machineCount} machine{machineCount !== 1 ? 's' : ''}
                    </span>
                    {lastItem && <span>Dernière : {shortDate(lastItem.updated_at)}</span>}
                  </>
                )}
              </div>
            </div>

            <div className="kb-list">
              {loading ? (
                <div
                  className="kb-list-skeleton"
                  role="status"
                  aria-busy="true"
                  aria-label="Chargement des fiches"
                >
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="kb-card kb-card-skeleton">
                      <Skeleton width="40%" height={12} />
                      <Skeleton width="75%" />
                      <Skeleton width="60%" height={12} />
                    </div>
                  ))}
                </div>
              ) : incidents.length === 0 ? (
                <div className="kb-empty">
                  <p>Aucune fiche trouvée.</p>
                  {emptyHint && <p className="kb-empty-hint">{emptyHint}</p>}
                </div>
              ) : (
                incidents.map((incident) => (
                  <KnowledgeCard
                    key={incident.id}
                    incident={incident}
                    active={String(incident.id) === selectedId}
                    onClick={() => selectIncident(incident.id)}
                  />
                ))
              )}
            </div>

            {hasMore && (
              <div className="journal-load-more">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Chargement…' : 'Charger la suite'}
                </button>
              </div>
            )}
          </div>

          {/* Colonne détail */}
          <div className="kb-detail-col" ref={detailRef}>
            {selectedIncident ? (
              <div className="card">
                <div className="card-body">
                  <KnowledgeDetail
                    incident={selectedIncident}
                    related={relatedIncidents}
                    onSelectRelated={selectIncident}
                    onViewHistory={() =>
                      navigate(`/workshop/history?incident=${selectedIncident.id}`)
                    }
                    onCopyLink={copyLink}
                    copied={copied}
                  />
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="card-body">
                  <EmptyState>Sélectionnez une fiche dans la liste.</EmptyState>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
