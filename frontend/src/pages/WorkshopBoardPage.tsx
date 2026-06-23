import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getBoardData, logoutBoardSession } from '../api/board';
import Modal from '../components/Modal';
import SelectField from '../components/ui/SelectField';
import BoardIncidentGrid, { BoardEmptyState } from '../components/board/BoardIncidentGrid';
import BoardLineGrid, { LineGroup } from '../components/board/BoardLineGrid';
import { useAppAuth } from '../routes/AppAuthContext';
import { WorkshopBoardIncident, WorkshopBoardLine } from '../types';
import { sortIncidents } from '../utils/incidentSort';
import {
  formatClock,
  formatTime,
  getOrCreateSessionScreenId,
  isOpenOverSevenDays,
  normalizeScreenId,
  paginate,
  statusLabel as _statusLabel,
} from '../utils/boardUtils';
import { usePageTitle } from '../hooks/usePageTitle';

const VIEW_DURATION_MS = 12000;
const ROWS_PER_PAGE = 6;
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
  maintenance: 'Technicien',
  responsable: 'Responsables',
  custom: 'Personnalisé',
};

function getBoardSettingsKey(screenId: string): string {
  return `${BOARD_SETTINGS_KEY}.${screenId}`;
}

function loadBoardSettings(storageKey: string): BoardSettings {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BoardSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed, lineIds: Array.isArray(parsed.lineIds) ? parsed.lineIds : [] };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveBoardSettings(storageKey: string, settings: BoardSettings) {
  window.localStorage.setItem(storageKey, JSON.stringify(settings));
}

function applyPreset(preset: BoardPreset): BoardSettings {
  if (preset === 'maintenance') {
    return { preset, showAlerts: true, showOpenCases: false, showLineSummary: false, onlyPriority: false, onlyNotTaken: false, lineIds: [] };
  }
  if (preset === 'responsable') {
    return { preset, showAlerts: false, showOpenCases: false, showLineSummary: true, onlyPriority: false, onlyNotTaken: false, lineIds: [] };
  }
  return { ...DEFAULT_SETTINGS, preset };
}

export default function WorkshopBoardPage() {
  usePageTitle('Tableau temps réel');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAppAuth();
  const user = session?.accountType === 'workshop' ? session.user : null;
  const screenParam = searchParams.get('screen');
  const screenId = normalizeScreenId(screenParam ?? getOrCreateSessionScreenId());
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
    void refreshBoard();
    const refreshId = window.setInterval(() => void refreshBoard(), 30000);
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
    const filtered = incidents
      .filter((inc) => {
        if (settings.lineIds.length === 0) return true;
        if (settings.lineIds.includes(NO_LINES_SELECTED)) return false;
        return settings.lineIds.includes(String(inc.line_id));
      })
      .filter((inc) => !settings.onlyPriority || inc.is_priority)
      .filter((inc) => !settings.onlyNotTaken || !inc.is_taken);
    return sortIncidents(filtered);
  }, [incidents, settings.lineIds, settings.onlyNotTaken, settings.onlyPriority]);

  const priorityCount = activeIncidents.filter((inc) => inc.is_priority).length;
  const openCount = activeIncidents.filter((inc) => inc.status === 'OPEN').length;
  const notTakenCount = activeIncidents.filter((inc) => !inc.is_taken).length;
  const pendingCount = activeIncidents.filter((inc) => inc.status === 'PENDING').length;
  const openOverSevenDaysCount = activeIncidents.filter(isOpenOverSevenDays).length;

  const boardMode: BoardMode =
    priorityCount > 0
      ? 'critical'
      : notTakenCount > 0 || pendingCount > 0 || openOverSevenDaysCount > 0 || openCount > 0
        ? 'watch'
        : 'normal';

  const boardModeLabel =
    boardMode === 'critical'
      ? 'Alerte atelier'
      : boardMode === 'watch'
        ? 'Surveillance atelier'
        : 'Atelier stable';

  const boardModeTitle =
    boardMode === 'critical'
      ? `${priorityCount} urgence${priorityCount > 1 ? 's' : ''} à traiter`
      : boardMode === 'watch'
        ? `${activeIncidents.length} cas ouvert${activeIncidents.length > 1 ? 's' : ''} dans le périmètre`
        : 'Aucun incident ouvert';


  const noLineScope = settings.lineIds.includes(NO_LINES_SELECTED);
  const alertIncidents = activeIncidents.filter(
    (inc) => inc.is_priority || !inc.is_taken || inc.status === 'PENDING'
  );

  const lineGroups = useMemo<LineGroup[]>(() => {
    const groups = new Map<string, WorkshopBoardIncident[]>();
    activeIncidents.forEach((inc) => {
      groups.set(inc.line_number, [...(groups.get(inc.line_number) ?? []), inc]);
    });
    return Array.from(groups.entries())
      .map(([lineNumber, items]) => ({
        lineNumber,
        count: items.length,
        urgent: items.filter((inc) => inc.is_priority).length,
        notTaken: items.filter((inc) => !inc.is_taken).length,
        pending: items.filter((inc) => inc.status === 'PENDING').length,
        machines: Array.from(new Set(items.map((inc) => inc.machine_id))).slice(0, 6),
      }))
      .sort((a, b) => b.urgent - a.urgent || b.notTaken - a.notTaken || b.count - a.count);
  }, [activeIncidents]);

  const activeView = safeViews[viewIndex] ?? safeViews[0] ?? 'alerts';
  const incidentPages = paginate(activeView === 'alerts' ? alertIncidents : activeIncidents, ROWS_PER_PAGE);
  const linePages = paginate(lineGroups, ROWS_PER_PAGE);
  const pages = activeView === 'lines' ? linePages : incidentPages;
  const safePageIndex = Math.min(pageIndex, pages.length - 1);
  const currentItemCount =
    activeView === 'lines'
      ? lineGroups.length
      : activeView === 'alerts'
        ? alertIncidents.length
        : activeIncidents.length;

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

  function updateDraftSettings(updates: Partial<BoardSettings>) {
    setDraftSettings((prev) => ({ ...prev, ...updates, preset: 'custom' }));
  }

  function saveSettings() {
    setSettings(draftSettings);
    saveBoardSettings(storageKey, draftSettings);
    setShowSettings(false);
  }

  async function closeBoardAccess() {
    await logoutBoardSession().catch(() => {});
    void navigate('/login', { replace: true });
  }

  function handleLineToggle(lineId: string) {
    setDraftSettings((prev) => {
      const allLineIds = lines.map((line) => String(line.id));
      const currentIds =
        prev.lineIds.length === 0
          ? allLineIds
          : prev.lineIds.filter((id) => id !== NO_LINES_SELECTED);
      const nextIds = currentIds.includes(lineId)
        ? currentIds.filter((id) => id !== lineId)
        : [...currentIds, lineId];
      return { ...prev, lineIds: nextIds.length === 0 ? [NO_LINES_SELECTED] : nextIds, preset: 'custom' };
    });
  }

  const viewTitle =
    activeView === 'alerts'
      ? 'Alertes à traiter'
      : activeView === 'all'
        ? 'Tous les incidents ouverts'
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
              {lastUpdated
                ? `Actualisé à ${formatTime(lastUpdated.toISOString())}`
                : 'Actualisation en cours'}
            </div>
          </div>
          <button className="board-exit" onClick={() => setShowSettings(true)}>
            Paramètres
          </button>
          {user ? (
            <button className="board-exit" onClick={() => void navigate('/workshop/dashboard')}>
              Tableau de bord
            </button>
          ) : (
            <button className="board-exit" onClick={() => void closeBoardAccess()}>
              Fermer l'accès
            </button>
          )}
        </div>
      </header>

      {error && <div className="board-error">{error}</div>}

      <section className="board-status-panel">
        <div className="board-status-copy">
          <span>{boardModeLabel}</span>
          <strong>{boardModeTitle}</strong>
          {noLineScope && (
            <p>Aucune ligne n'est incluse dans les paramètres de cet écran.</p>
          )}
        </div>
        <div className="board-status-meta">
          <span>Écran {screenLabel}</span>
          <span>
            {viewTitle} · Page {safePageIndex + 1}/{pages.length}
          </span>
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
          <BoardEmptyState
            boardModeLabel={boardModeLabel}
            title={noLineScope ? 'Aucune ligne affichée' : 'Aucun incident ouvert'}
            detail={
              noLineScope
                ? 'Ouvrez les paramètres pour sélectionner les lignes à afficher sur cet écran.'
                : 'Le périmètre affiché est stable. Les nouveaux cas apparaîtront automatiquement.'
            }
          />
        ) : (
          <div className="board-view">
            <div className="board-view-header">
              <h2>{viewTitle}</h2>
              <span>
                Page {safePageIndex + 1}/{pages.length}
              </span>
            </div>
            {activeView === 'lines' ? (
              <BoardLineGrid
                items={linePages[safePageIndex] ?? []}
                boardModeLabel={boardModeLabel}
              />
            ) : (
              <BoardIncidentGrid
                items={incidentPages[safePageIndex] ?? []}
                activeView={activeView}
                boardModeLabel={boardModeLabel}
              />
            )}
          </div>
        )}
      </section>

      {showSettings && (
        <Modal
          title="Paramètres d'affichage"
          onClose={() => {
            setDraftSettings(settings);
            setShowSettings(false);
          }}
          size="lg"
          isDirty={JSON.stringify(draftSettings) !== JSON.stringify(settings)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => setDraftSettings(DEFAULT_SETTINGS)}
              >
                Réinitialiser
              </button>
              <button className="btn btn-primary" onClick={saveSettings}>
                Enregistrer
              </button>
            </>
          }
        >
          <div className="board-settings-panel">
            <div className="notice">Portée : écran {screenId} uniquement.</div>

            <section className="board-settings-section">
              <div>
                <h3>Profil</h3>
                <p>Choisit le scénario d'affichage principal.</p>
              </div>
              <div className="form-group">
                <label className="form-label">Type d'écran</label>
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
                    onChange={(e) => updateDraftSettings({ showAlerts: e.target.checked })}
                  />
                  Alertes à traiter
                </label>
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.showOpenCases}
                    onChange={(e) => updateDraftSettings({ showOpenCases: e.target.checked })}
                  />
                  Tous les incidents ouverts
                </label>
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.showLineSummary}
                    onChange={(e) => updateDraftSettings({ showLineSummary: e.target.checked })}
                  />
                  Situation par ligne
                </label>
              </div>
            </section>

            <section className="board-settings-section">
              <div>
                <h3>Filtres</h3>
                <p>Réduit les incidents visibles sur cet écran uniquement.</p>
              </div>
              <div className="board-setting-options">
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.onlyPriority}
                    onChange={(e) => updateDraftSettings({ onlyPriority: e.target.checked })}
                  />
                  Urgences uniquement
                </label>
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.onlyNotTaken}
                    onChange={(e) => updateDraftSettings({ onlyNotTaken: e.target.checked })}
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
                    const selected =
                      draftSettings.lineIds.length === 0 ||
                      (!draftSettings.lineIds.includes(NO_LINES_SELECTED) &&
                        draftSettings.lineIds.includes(String(line.id)));
                    const customSelected = draftSettings.lineIds.includes(String(line.id));
                    return (
                      <label
                        key={line.id}
                        className={`board-line-select-chip ${selected ? 'active' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleLineToggle(String(line.id))}
                        />
                        <span>Ligne {line.line_number}</span>
                        <strong>
                          {draftSettings.lineIds.length === 0
                            ? 'incluse'
                            : customSelected
                              ? 'incluse'
                              : 'masquée'}
                        </strong>
                      </label>
                    );
                  })}
                </div>
                {draftSettings.lineIds.length > 0 &&
                  !draftSettings.lineIds.includes(NO_LINES_SELECTED) && (
                    <div className="board-lines-selected-summary">
                      {draftSettings.lineIds.length} ligne(s) affichée(s) :{' '}
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
