import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getBoardData, logoutBoardSession } from '../api/board';
import Modal from '../components/Modal';
import SelectField from '../components/ui/SelectField';
import { useAppAuth } from '../routes/AppAuthContext';
import { WorkshopBoardIncident, WorkshopBoardLine } from '../types';
import { STATE_LABELS } from '../utils/labels';

const VIEW_DURATION_MS = 12000;
const ROWS_PER_PAGE = 9;
type BoardView = 'alerts' | 'all' | 'lines';
const VIEWS: BoardView[] = ['alerts', 'all', 'lines'];
type BoardMode = 'normal' | 'watch' | 'critical';
type BoardPreset = 'default' | 'maintenance' | 'responsable' | 'custom';
type BoardSettings = {
  preset: BoardPreset;
  showAlerts: boolean;
  showOpenCases: boolean;
  showLineSummary: boolean;
  onlyPriority: boolean;
  onlyNotTaken: boolean;
  lineIds: string[];
};
const BOARD_SETTINGS_KEY = 'sentinel.board.settings.v1';
const BOARD_SESSION_SCREEN_KEY = 'sentinel.board.sessionScreenId.v1';
const NO_LINES_SELECTED = '__none__';
const DEFAULT_SETTINGS: BoardSettings = {
  preset: 'default',
  showAlerts: true,
  showOpenCases: true,
  showLineSummary: true,
  onlyPriority: false,
  onlyNotTaken: false,
  lineIds: [],
};
const PRESET_LABELS: Record<BoardPreset, string> = {
  default: 'Standard',
  maintenance: 'Maintenance',
  responsable: 'Responsables',
  custom: 'Personnalisé',
};
type LineGroup = {
  lineNumber: string;
  count: number;
  urgent: number;
  notTaken: number;
  pending: number;
  machines: string[];
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatClock(date: Date): string {
  return date.toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(incident: WorkshopBoardIncident): string {
  if (incident.status === 'PENDING') return 'En attente';
  return incident.is_taken ? 'Pris en charge' : 'Non pris';
}

function ageLabel(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.max(0, Math.floor(diffMs / 3600000));
  if (hours < 1) return '< 1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

function isOpenOverSevenDays(incident: WorkshopBoardIncident): boolean {
  return incident.status === 'OPEN' && Date.now() - new Date(incident.created_at).getTime() > 7 * 24 * 60 * 60 * 1000;
}

function paginate<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const pages: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

function normalizeScreenId(value: string | null): string {
  const normalized = (value || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return normalized || 'default';
}

function getOrCreateSessionScreenId(): string {
  try {
    const existing = window.sessionStorage.getItem(BOARD_SESSION_SCREEN_KEY);
    if (existing) return existing;
    const generated = `ecran-${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(BOARD_SESSION_SCREEN_KEY, generated);
    return generated;
  } catch {
    return 'ecran-local';
  }
}

function getBoardSettingsKey(screenId: string): string {
  return `${BOARD_SETTINGS_KEY}.${screenId}`;
}

function loadBoardSettings(storageKey: string): BoardSettings {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BoardSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      lineIds: Array.isArray(parsed.lineIds) ? parsed.lineIds : [],
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveBoardSettings(storageKey: string, settings: BoardSettings) {
  window.localStorage.setItem(storageKey, JSON.stringify(settings));
}

export default function WorkshopBoardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAppAuth();
  const user = session?.accountType === 'workshop' ? session.user : null;
  const screenParam = searchParams.get('screen');
  const screenId = normalizeScreenId(screenParam || getOrCreateSessionScreenId());
  const storageKey = getBoardSettingsKey(screenId);
  const [incidents, setIncidents] = useState<WorkshopBoardIncident[]>([]);
  const [lines, setLines] = useState<WorkshopBoardLine[]>([]);
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [viewIndex, setViewIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<BoardSettings>(() => loadBoardSettings(storageKey));
  const [draftSettings, setDraftSettings] = useState<BoardSettings>(() => loadBoardSettings(storageKey));

  const configuredViews: BoardView[] = [
    settings.showAlerts ? 'alerts' : null,
    settings.showOpenCases ? 'all' : null,
    settings.showLineSummary ? 'lines' : null,
  ].filter(Boolean) as BoardView[];
  const safeViews = configuredViews.length > 0 ? configuredViews : VIEWS;

  useEffect(() => {
    if (screenParam) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('screen', screenId);
    setSearchParams(nextParams, { replace: true });
  }, [screenId, screenParam, searchParams, setSearchParams]);

  async function refreshBoard() {
    try {
      const boardData = await getBoardData();
      setIncidents(boardData.incidents);
      setLines(boardData.lines);
      setLastUpdated(new Date());
      setError('');
    } catch {
      setError('Données temporairement indisponibles');
    }
  }

  useEffect(() => {
    refreshBoard();
    const refreshId = window.setInterval(refreshBoard, 30000);
    const clockId = window.setInterval(() => setNow(new Date()), 15000);
    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
    };
  }, []);

  useEffect(() => {
    const nextSettings = loadBoardSettings(storageKey);
    setSettings(nextSettings);
    setDraftSettings(nextSettings);
    setViewIndex(0);
    setPageIndex(0);
  }, [storageKey]);

  const activeIncidents = useMemo(() => {
    return incidents
      .filter((incident) => {
        if (settings.lineIds.length === 0) return true;
        if (settings.lineIds.includes(NO_LINES_SELECTED)) return false;
        return settings.lineIds.includes(String(incident.line_id));
      })
      .filter((incident) => !settings.onlyPriority || incident.is_priority)
      .filter((incident) => !settings.onlyNotTaken || !incident.is_taken)
      .sort((a, b) => {
        if (a.is_priority !== b.is_priority) return a.is_priority ? -1 : 1;
        if (a.display_order !== b.display_order) return b.display_order - a.display_order;
        if (a.is_taken !== b.is_taken) return a.is_taken ? 1 : -1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [incidents, settings.lineIds, settings.onlyNotTaken, settings.onlyPriority]);

  const priorityCount = activeIncidents.filter((incident) => incident.is_priority).length;
  const openCount = activeIncidents.filter((incident) => incident.status === 'OPEN').length;
  const notTakenCount = activeIncidents.filter((incident) => !incident.is_taken).length;
  const pendingCount = activeIncidents.filter((incident) => incident.status === 'PENDING').length;
  const openOverSevenDaysCount = activeIncidents.filter(isOpenOverSevenDays).length;
  const boardMode: BoardMode = priorityCount > 0
    ? 'critical'
    : notTakenCount > 0 || pendingCount > 0 || openOverSevenDaysCount > 0 || openCount > 0
      ? 'watch'
      : 'normal';
  const boardModeLabel = boardMode === 'critical'
    ? 'Alerte atelier'
    : boardMode === 'watch'
      ? 'Surveillance atelier'
      : 'Atelier stable';
  const boardModeTitle = boardMode === 'critical'
    ? `${priorityCount} urgence${priorityCount > 1 ? 's' : ''} à traiter`
    : boardMode === 'watch'
      ? `${activeIncidents.length} cas ouvert${activeIncidents.length > 1 ? 's' : ''} dans le périmètre`
      : 'Aucun incident ouvert';
  const boardModeDetail = boardMode === 'critical'
    ? 'Les urgences et les cas non pris restent affichés en priorité.'
    : boardMode === 'watch'
      ? 'L’écran suit les cas ouverts et fait tourner les vues utiles automatiquement.'
      : 'Le périmètre affiché ne contient aucun cas actif.';
  const noLineScope = settings.lineIds.includes(NO_LINES_SELECTED);
  const alertIncidents = activeIncidents.filter((incident) =>
    incident.is_priority || !incident.is_taken || incident.status === 'PENDING'
  );
  const lineGroups = useMemo<LineGroup[]>(() => {
    const groups = new Map<string, WorkshopBoardIncident[]>();
    activeIncidents.forEach((incident) => {
      groups.set(incident.line_number, [...(groups.get(incident.line_number) || []), incident]);
    });
    return Array.from(groups.entries())
      .map(([lineNumber, items]) => ({
        lineNumber,
        count: items.length,
        urgent: items.filter((incident) => incident.is_priority).length,
        notTaken: items.filter((incident) => !incident.is_taken).length,
        pending: items.filter((incident) => incident.status === 'PENDING').length,
        machines: Array.from(new Set(items.map((incident) => incident.machine_id))).slice(0, 6),
      }))
      .sort((a, b) => b.urgent - a.urgent || b.notTaken - a.notTaken || b.count - a.count);
  }, [activeIncidents]);

  const activeView = safeViews[viewIndex] || safeViews[0] || 'alerts';
  const incidentPages = paginate(
    activeView === 'alerts' ? alertIncidents : activeIncidents,
    ROWS_PER_PAGE
  );
  const linePages = paginate(lineGroups, ROWS_PER_PAGE);
  const pages = activeView === 'lines' ? linePages : incidentPages;
  const safePageIndex = Math.min(pageIndex, pages.length - 1);
  const currentItemCount = activeView === 'lines' ? lineGroups.length : (activeView === 'alerts' ? alertIncidents.length : activeIncidents.length);

  useEffect(() => {
    setPageIndex(0);
  }, [viewIndex, incidents.length]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPageIndex((currentPage) => {
        const nextPage = currentPage + 1;
        if (nextPage < pages.length) return nextPage;
        setViewIndex((currentView) => (currentView + 1) % safeViews.length);
        return 0;
      });
    }, VIEW_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [pages.length, safeViews.length]);

  useEffect(() => {
    setViewIndex(0);
    setPageIndex(0);
    setDraftSettings(settings);
  }, [settings]);

  function applyPreset(preset: BoardPreset): BoardSettings {
    if (preset === 'maintenance') {
      return { preset, showAlerts: true, showOpenCases: false, showLineSummary: false, onlyPriority: false, onlyNotTaken: false, lineIds: [] };
    }
    if (preset === 'responsable') {
      return { preset, showAlerts: false, showOpenCases: false, showLineSummary: true, onlyPriority: false, onlyNotTaken: false, lineIds: [] };
    }
    return { ...DEFAULT_SETTINGS, preset };
  }

  function updateDraftSettings(updates: Partial<BoardSettings>) {
    setDraftSettings((prev) => ({ ...prev, ...updates, preset: 'custom' }));
  }

  function saveSettings() {
    const nextSettings = draftSettings;
    setSettings(nextSettings);
    saveBoardSettings(storageKey, nextSettings);
    setShowSettings(false);
  }

  async function closeBoardAccess() {
    await logoutBoardSession().catch(() => {});
    navigate('/login', { replace: true });
  }

  function handleLineToggle(lineId: string) {
    setDraftSettings((prev) => {
      const allLineIds = lines.map((line) => String(line.id));
      const currentIds = prev.lineIds.length === 0
        ? allLineIds
        : prev.lineIds.filter((id) => id !== NO_LINES_SELECTED);
      const nextIds = currentIds.includes(lineId)
        ? currentIds.filter((id) => id !== lineId)
        : [...currentIds, lineId];

      return {
        ...prev,
        lineIds: nextIds.length === 0 ? [NO_LINES_SELECTED] : nextIds,
        preset: 'custom',
      };
    });
  }

  function renderEmptyState(title: string, detail: string) {
    return (
      <div className="board-empty-state">
        <span>{boardModeLabel}</span>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    );
  }

  function renderIncidentRows(items: WorkshopBoardIncident[]) {
    if (items.length === 0) {
      return renderEmptyState(
        activeView === 'alerts' ? 'Aucune alerte prioritaire' : 'Aucun cas visible',
        activeView === 'alerts'
          ? 'Les cas ouverts sans urgence restent visibles dans les autres vues configurées.'
          : 'Le filtrage de cet écran ne retourne aucun incident.'
      );
    }

    return (
      <div className="board-incident-grid">
        {items.map((incident) => (
          <article
            className={`board-incident-card ${
              incident.is_priority
                ? 'board-incident-critical'
                : incident.status === 'PENDING' || !incident.is_taken
                  ? 'board-incident-watch'
                  : 'board-incident-steady'
            }`}
            key={incident.id}
          >
            <div className="board-incident-top">
              <span>Ligne {incident.line_number}</span>
              <span>{STATE_LABELS[incident.state] || incident.state}</span>
            </div>
            <div className="board-incident-product">
              <span>Produit en cours</span>
              <strong>{incident.current_product || 'Non renseigné'}</strong>
            </div>
            <div className="board-incident-equipment">
              <span>Équipement</span>
              <strong>{incident.machine_id}</strong>
              <small>{incident.robot_label} · Tête {incident.head_number}</small>
            </div>
            <div className="board-incident-footer">
              <span>Depuis {ageLabel(incident.created_at)} · {formatTime(incident.created_at)}</span>
              <div className="board-incident-status">
              {incident.is_priority && <span className="board-chip board-chip-critical">Urgent</span>}
              <span className={`board-chip ${
                incident.status === 'PENDING'
                  ? 'board-chip-warning'
                  : incident.is_taken
                    ? 'board-chip-success'
                    : 'board-chip-danger'
              }`}>
                {statusLabel(incident)}
              </span>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderLineRows(items: LineGroup[]) {
    if (items.length === 0) {
      return renderEmptyState('Aucune ligne à surveiller', 'Le périmètre choisi ne contient pas de cas ouvert.');
    }

    return (
      <div className="board-line-grid">
        {items.map((line) => (
          <article className={`board-line-card ${line.urgent > 0 ? 'board-line-critical' : ''}`} key={line.lineNumber}>
            <div>
              <span>Ligne</span>
              <strong>{line.lineNumber}</strong>
            </div>
            <div>
              <span>Ouverts</span>
              <strong>{line.count}</strong>
            </div>
            <div>
              <span>Urgents</span>
              <strong>{line.urgent}</strong>
            </div>
            <div>
              <span>Non pris</span>
              <strong>{line.notTaken}</strong>
            </div>
            <p>{line.machines.join(', ') || 'Aucune machine concernée'}</p>
          </article>
        ))}
      </div>
    );
  }

  const viewTitle = activeView === 'alerts'
    ? 'Alertes à traiter'
    : activeView === 'all'
      ? 'Tous les cas ouverts'
      : 'Situation par ligne';
  const profileLabel = PRESET_LABELS[settings.preset];
  const screenLabel = screenId.replace(/^ecran[-_]/i, '').toUpperCase();

  return (
    <main id="main-content" className={`board-page board-page-${boardMode}`}>
      <header className="board-header">
        <div>
          <div className="board-brand">SENTINEL · {profileLabel}</div>
          <h1>{boardModeLabel}</h1>
        </div>
        <div className="board-header-actions">
          <div className="board-timebox">
            <div className="board-clock">{formatClock(now)}</div>
            <div className="board-freshness">
              {lastUpdated ? `Actualisé à ${formatTime(lastUpdated.toISOString())}` : 'Actualisation en cours'}
            </div>
          </div>
          <button className="board-exit" onClick={() => setShowSettings(true)}>
            Paramètres
          </button>
          {user ? (
            <button className="board-exit" onClick={() => navigate('/workshop/dashboard')}>
              Tableau de bord
            </button>
          ) : (
            <button className="board-exit" onClick={closeBoardAccess}>
              Fermer l’accès
            </button>
          )}
        </div>
      </header>

      {error && <div className="board-error">{error}</div>}

      <section className="board-status-panel">
        <div className="board-status-copy">
          <span>{boardModeLabel}</span>
          <strong>{boardModeTitle}</strong>
          <p>{noLineScope ? 'Aucune ligne n’est incluse dans les paramètres de cet écran.' : boardModeDetail}</p>
        </div>
        <div className="board-status-meta">
          <span>Écran {screenLabel}</span>
          <span>{viewTitle} · Page {safePageIndex + 1}/{pages.length}</span>
        </div>
      </section>

      <section className="board-metrics">
        <div className="board-metric">
          <span>Ouverts</span>
          <strong>{openCount}</strong>
        </div>
        <div className="board-metric board-metric-danger">
          <span>Urgents</span>
          <strong>{priorityCount}</strong>
        </div>
        <div className="board-metric">
          <span>Non pris</span>
          <strong>{notTakenCount}</strong>
        </div>
        <div className="board-metric">
          <span>En attente</span>
          <strong>{pendingCount}</strong>
        </div>
        <div className="board-metric">
          <span>Ouverts &gt; 7j</span>
          <strong>{openOverSevenDaysCount}</strong>
        </div>
      </section>

      <section className={`board-viewport ${currentItemCount <= 4 ? 'is-compact' : ''}`}>
        {activeIncidents.length === 0 ? (
          renderEmptyState(
            noLineScope ? 'Aucune ligne affichée' : 'Aucun incident ouvert',
            noLineScope
              ? 'Ouvrez les paramètres pour sélectionner les lignes à afficher sur cet écran.'
              : 'Le périmètre affiché est stable. Les nouveaux cas apparaîtront automatiquement.'
          )
        ) : (
          <div className="board-view">
            <div className="board-view-header">
              <h2>{viewTitle}</h2>
              <span>Page {safePageIndex + 1}/{pages.length}</span>
            </div>
            {activeView === 'lines'
              ? renderLineRows(linePages[safePageIndex] || [])
              : renderIncidentRows(incidentPages[safePageIndex] || [])}
          </div>
        )}
      </section>

      {showSettings && (
        <Modal
          title="Paramètres d’affichage"
          onClose={() => {
            setDraftSettings(settings);
            setShowSettings(false);
          }}
          size="lg"
          isDirty={JSON.stringify(draftSettings) !== JSON.stringify(settings)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDraftSettings(DEFAULT_SETTINGS)}>
                Réinitialiser
              </button>
              <button className="btn btn-primary" onClick={saveSettings}>
                Enregistrer
              </button>
            </>
          }
        >
          <div className="board-settings-panel">
            <div className="notice">
              Ces paramètres concernent uniquement cet écran : {screenId}.
            </div>

            <section className="board-settings-section">
              <div>
                <h3>Profil</h3>
                <p>Choisit le scénario d’affichage principal.</p>
              </div>
              <div className="form-group">
              <label className="form-label">Type d’écran</label>
              <SelectField
                value={draftSettings.preset}
                onChange={(value) => setDraftSettings(applyPreset(value as BoardPreset))}
                options={[
                  { value: 'default', label: `${PRESET_LABELS.default} · rotation complète` },
                  { value: 'maintenance', label: `${PRESET_LABELS.maintenance} · alertes à traiter` },
                  { value: 'responsable', label: `${PRESET_LABELS.responsable} · situation par ligne` },
                  { value: 'custom', label: `${PRESET_LABELS.custom} · filtres avancés` },
                ]}
              />
            </div>
            </section>

            <section className="board-settings-section">
              <div>
                <h3>Contenu</h3>
                <p>Définit les vues qui tournent automatiquement.</p>
              </div>
              <div className="board-setting-options">
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.showAlerts}
                    onChange={(event) => updateDraftSettings({ showAlerts: event.target.checked })}
                  />
                  Alertes à traiter
                </label>
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.showOpenCases}
                    onChange={(event) => updateDraftSettings({ showOpenCases: event.target.checked })}
                  />
                  Tous les cas ouverts
                </label>
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.showLineSummary}
                    onChange={(event) => updateDraftSettings({ showLineSummary: event.target.checked })}
                  />
                  Situation par ligne
                </label>
              </div>
            </section>

            <section className="board-settings-section">
              <div>
                <h3>Filtres</h3>
                <p>Réduit les cas visibles sur cet écran uniquement.</p>
              </div>
              <div className="board-setting-options">
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.onlyPriority}
                    onChange={(event) => updateDraftSettings({ onlyPriority: event.target.checked })}
                  />
                  Urgences uniquement
                </label>
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.onlyNotTaken}
                    onChange={(event) => updateDraftSettings({ onlyNotTaken: event.target.checked })}
                  />
                  Non pris uniquement
                </label>
              </div>
            </section>

            <details className="board-settings-section board-settings-lines">
              <summary>
                <span className="board-lines-summary">
                  <span className="board-lines-toggle">Voir la liste</span>
                  <span className="board-lines-summary-title">
                    <strong>Lignes affichées</strong>
                  </span>
                    <small>
                      {draftSettings.lineIds.length === 0
                        ? 'Toutes les lignes'
                        : draftSettings.lineIds.includes(NO_LINES_SELECTED)
                          ? 'Aucune ligne'
                          : `${draftSettings.lineIds.length} ligne(s) sélectionnée(s)`}
                    </small>
                </span>
              </summary>
              <div className="board-lines-picker">
                <div className="board-lines-toolbar">
                  <button
                    type="button"
                    className={`board-lines-action ${draftSettings.lineIds.length === 0 ? 'active' : ''}`}
                    onClick={() => updateDraftSettings({ lineIds: [] })}
                  >
                    Toutes les lignes
                  </button>
                  <button
                    type="button"
                    className={`board-lines-action ${draftSettings.lineIds.includes(NO_LINES_SELECTED) ? 'active' : ''}`}
                    onClick={() => updateDraftSettings({ lineIds: [NO_LINES_SELECTED] })}
                  >
                    Aucune ligne
                  </button>
                </div>
                <div className="board-line-chip-grid">
                  {lines.map((line) => {
                    const selected = draftSettings.lineIds.length === 0
                      || (!draftSettings.lineIds.includes(NO_LINES_SELECTED) && draftSettings.lineIds.includes(String(line.id)));
                    const customSelected = draftSettings.lineIds.includes(String(line.id));
                    return (
                      <label className={`board-line-select-chip ${selected ? 'active' : ''}`} key={line.id}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleLineToggle(String(line.id))}
                        />
                        <span>Ligne {line.line_number}</span>
                        <strong>{draftSettings.lineIds.length === 0 ? 'incluse' : customSelected ? 'incluse' : 'masquée'}</strong>
                      </label>
                    );
                  })}
                </div>
                {draftSettings.lineIds.length > 0 && !draftSettings.lineIds.includes(NO_LINES_SELECTED) && (
                  <div className="board-lines-selected-summary">
                    {draftSettings.lineIds.length} ligne(s) affichée(s) :
                    {' '}
                    {lines
                      .filter((line) => draftSettings.lineIds.includes(String(line.id)))
                      .map((line) => `Ligne ${line.line_number}`)
                      .join(', ')}
                  </div>
                )}
                {draftSettings.lineIds.includes(NO_LINES_SELECTED) && (
                  <div className="board-lines-selected-summary">
                    Aucune ligne ne sera affichée sur cet écran.
                  </div>
                )}
              </div>
            </details>
          </div>
        </Modal>
      )}
    </main>
  );
}
