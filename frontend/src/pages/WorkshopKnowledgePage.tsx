import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getWorkshopKnowledgeIncident,
  listWorkshopKnowledgeIncidents,
  listWorkshopLines,
} from '../api/workshop';
import FilterSummary, { FilterChip } from '../components/FilterSummary';
import EmptyState from '../components/ui/EmptyState';
import ErrorBanner from '../components/ui/ErrorBanner';
import Skeleton from '../components/ui/Skeleton';
import SelectField from '../components/ui/SelectField';
import WorkshopNavBar from '../components/WorkshopNavBar';
import { ProductionLine, WorkshopIncident } from '../types';
import { formatDateTime, STATE_LABELS } from '../utils/workshopHistory';
import { formatDuration } from '../utils/durationFormat';
import {
  buildIncidentWorkspaceParams,
  getWorkshopMachineOptions,
  lineFilterChip,
  machineFilterChip,
  searchFilterChip,
  stateFilterChip,
  withWorkshopLineFilter,
  withWorkshopUrlFilter,
} from '../utils/workshopFilters';
import { usePageTitle } from '../hooks/usePageTitle';

// ── Couleurs par type d'anomalie ───────────────────────────────────
const STATE_TONE: Record<string, string> = {
  SKIPEE_PAR_MACHINE:    'kb-state-machine',
  SKIPEE_PAR_CONDUCTEUR: 'kb-state-conducteur',
  DEGRADEE:              'kb-state-degradee',
  INDISPONIBLE:          'kb-state-indisponible',
};

function stateToneClass(state: string): string {
  return STATE_TONE[state] ?? 'kb-state-default';
}


function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
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
      onClick={onClick}
    >
      <div className="kb-card-top">
        <span className={`kb-state-badge ${stateToneClass(incident.state)}`}>
          {STATE_LABELS[incident.state] || incident.state}
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
      {preview && (
        <span className="kb-card-preview">{preview}</span>
      )}
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

function KnowledgeDetail({ incident, related, onSelectRelated, onViewHistory, onCopyLink, copied }: KnowledgeDetailProps) {
  const resTime = formatDuration(incident.created_at, incident.updated_at);
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
          {STATE_LABELS[incident.state] || incident.state}
        </span>
      </div>

      {/* Méta-données */}
      <div className="kb-meta-grid">
        <div className="kb-meta-item">
          <span className="detail-field-label">Équipement</span>
          <strong>{incident.robot_label} · Tête {incident.head_number}</strong>
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

        {incident.diagnostic && (
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
            <span className="detail-field-label">Consigne responsable</span>
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
                <button type="button" className="kb-related-item" onClick={() => onSelectRelated(r.id)}>
                  <span className={`kb-state-badge ${stateToneClass(r.state)}`}>
                    {STATE_LABELS[r.state] || r.state}
                  </span>
                  <span className="kb-related-where">Ligne {r.line_number} · {r.machine_id}</span>
                  {r.intervention_note && <span className="kb-related-preview">{r.intervention_note}</span>}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [incidents, setIncidents] = useState<WorkshopIncident[]>([]);
  const [lines, setLines] = useState<ProductionLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [lineFilter, setLineFilter] = useState(searchParams.get('line') || 'all');
  const [machineFilter, setMachineFilter] = useState(searchParams.get('machine') || 'all');
  const [stateFilter, setStateFilter] = useState(searchParams.get('state') || 'all');
  const [selectedId, setSelectedId] = useState('');
  const [copied, setCopied] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listWorkshopLines()
      .then(setLines)
      .catch(() => setError('Impossible de charger les référentiels atelier.'));
  }, []);

  useEffect(() => {
    const params = buildIncidentWorkspaceParams({
      query,
      stateFilter,
      lineFilter,
      machineFilter,
      limit: 300,
    });

    setLoading(true);
    setError('');
    listWorkshopKnowledgeIncidents(params)
      .then((data) => {
        setIncidents(data);
        setSelectedId((cur) => {
          if (data.length === 0) return '';
          return data.some((i) => String(i.id) === cur) ? cur : String(data[0].id);
        });
      })
      .catch(() => setError('Impossible de charger la base de connaissance.'))
      .finally(() => setLoading(false));
  }, [query, stateFilter, lineFilter, machineFilter]);

  useEffect(() => {
    const requestedId = searchParams.get('incident');
    if (!requestedId) return;
    if (incidents.some((i) => String(i.id) === requestedId)) {
      setSelectedId(requestedId);
      return;
    }
    const parsedId = Number(requestedId);
    if (!Number.isInteger(parsedId) || parsedId <= 0) return;
    getWorkshopKnowledgeIncident(parsedId)
      .then((incident) => {
        setIncidents((cur) => cur.some((i) => i.id === incident.id) ? cur : [incident, ...cur]);
        setSelectedId(String(incident.id));
      })
      .catch(() => setError("Cette fiche connaissance n'est pas disponible."));
  }, [searchParams, incidents]);

  const machineOptions = getWorkshopMachineOptions(lines, lineFilter);
  const machineCount = new Set(incidents.map((i) => i.machine_id)).size;
  const lastItem = incidents[0];
  const selectedIncident = incidents.find((i) => String(i.id) === selectedId);

  // Cas similaires : mêmes équipement ou anomalie que la fiche ouverte (P5).
  // Priorité aux fiches même machine, puis même type d'anomalie ; limité à 4.
  const relatedIncidents = selectedIncident
    ? incidents
        .filter((i) => i.id !== selectedIncident.id &&
          (i.machine_id === selectedIncident.machine_id || i.state === selectedIncident.state))
        .sort((a, b) => {
          const aSame = a.machine_id === selectedIncident.machine_id ? 0 : 1;
          const bSame = b.machine_id === selectedIncident.machine_id ? 0 : 1;
          return aSame - bSame;
        })
        .slice(0, 4)
    : [];

  // Chips de filtres actifs
  const filterChips: FilterChip[] = [
    ...searchFilterChip(query, () => { setQuery(''); updateSearchFilter('q', '', ''); }),
    ...lineFilterChip(lines, lineFilter, () => updateLineFilter('all')),
    ...machineFilterChip(machineFilter, () => { setMachineFilter('all'); updateSearchFilter('machine', 'all'); }),
    ...stateFilterChip(stateFilter, () => { setStateFilter('all'); updateSearchFilter('state', 'all'); }),
  ];

  // Suggestion de filtre à supprimer pour état vide
  const emptyHint = !loading && incidents.length === 0
    ? filterChips.length > 0
      ? 'Essayez de supprimer un filtre actif.'
      : 'Aucune intervention documentée pour le moment.'
    : null;

  function selectIncident(id: number): void {
    const next = new URLSearchParams(searchParams);
    next.set('incident', String(id));
    setSearchParams(next);
    setSelectedId(String(id));
    // Scroll vers le détail sur mobile
    setTimeout(() => {
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function updateSearchFilter(name: string, value: string, fallback = 'all'): void {
    setSearchParams(withWorkshopUrlFilter(searchParams, name, value, fallback));
  }

  function updateLineFilter(value: string): void {
    setLineFilter(value);
    setMachineFilter('all');
    setSearchParams(withWorkshopLineFilter(searchParams, value));
  }

  function clearFilters(): void {
    setQuery('');
    setLineFilter('all');
    setMachineFilter('all');
    setStateFilter('all');
    const next = new URLSearchParams();
    if (selectedId) next.set('incident', selectedId);
    setSearchParams(next);
  }

  function copyLink(): void {
    const url = `${window.location.origin}${window.location.pathname}?incident=${selectedId}`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
                {incidents.length} intervention{incidents.length !== 1 ? 's' : ''} documentée{incidents.length !== 1 ? 's' : ''}
                {' '}sur {machineCount} machine{machineCount !== 1 ? 's' : ''} — la mémoire de l'atelier.
              </p>
            )}
          </div>
        </div>

        {error && <ErrorBanner style={{ marginBottom: 16 }}>{error}</ErrorBanner>}

        {/* ── Filtres ── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="history-grid">
              <div className="form-group">
                <label className="form-label">Recherche</label>
                <input
                  className="form-input"
                  placeholder="Symptôme, solution, machine, produit..."
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); updateSearchFilter('q', e.target.value, ''); }}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Ligne</label>
                <SelectField
                  value={lineFilter}
                  onChange={updateLineFilter}
                  options={[
                    { value: 'all', label: 'Toutes' },
                    ...lines.map((l) => ({ value: String(l.id), label: l.line_number })),
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Machine</label>
                <SelectField
                  value={machineFilter}
                  onChange={(v) => { setMachineFilter(v); updateSearchFilter('machine', v); }}
                  disabled={lineFilter === 'all'}
                  options={[
                    { value: 'all', label: 'Toutes' },
                    ...machineOptions.map((m) => ({ value: m.id, label: m.label })),
                  ]}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Type d'anomalie</label>
                <SelectField
                  value={stateFilter}
                  onChange={(v) => { setStateFilter(v); updateSearchFilter('state', v); }}
                  options={[
                    { value: 'all', label: 'Tous' },
                    ...Object.entries(STATE_LABELS).map(([v, label]) => ({ value: v, label })),
                  ]}
                />
              </div>
            </div>
            <FilterSummary
              count={incidents.length}
              countLabel="fiche(s) affichée(s)"
              chips={filterChips}
              onClear={clearFilters}
              emptyText="Base complète"
              className="filter-summary-embedded"
            />
          </div>
        </div>

        {/* ── Layout master-detail ── */}
        <div className="kb-layout">

          {/* Colonne liste */}
          <div className="kb-list-col">
            <div className="kb-list-header">
              <span className="detail-field-label">
                {loading ? 'Chargement…' : `${incidents.length} fiche${incidents.length !== 1 ? 's' : ''}`}
              </span>
              <div className="kb-list-meta">
                {!loading && incidents.length > 0 && (
                  <>
                    <span>{machineCount} machine{machineCount !== 1 ? 's' : ''}</span>
                    {lastItem && <span>Dernière : {shortDate(lastItem.updated_at)}</span>}
                  </>
                )}
              </div>
            </div>

            <div className="kb-list">
              {loading ? (
                <div className="kb-list-skeleton" aria-busy="true" aria-label="Chargement des fiches">
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
                    onViewHistory={() => navigate(`/workshop/history?incident=${selectedIncident.id}`)}
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
