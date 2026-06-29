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
  viewDurationSec: number;
  rowsPerPage: number;
  compactMetrics: boolean;
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
  viewDurationSec: 12,
  rowsPerPage: 6,
  compactMetrics: false,
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

function applyPreset(preset: BoardPreset, current: BoardSettings): BoardSettings {
  const display = { viewDurationSec: current.viewDurationSec, rowsPerPage: current.rowsPerPage, compactMetrics: current.compactMetrics };
  if (preset === 'maintenance') {
    return { ...DEFAULT_SETTINGS, ...display, preset, showAlerts: true, showOpenCases: false, showLineSummary: false };
  }
  if (preset === 'responsable') {
    return { ...DEFAULT_SETTINGS, ...display, preset, showAlerts: false, showOpenCases: false, showLineSummary: true };
  }
  return { ...DEFAULT_SETTINGS, ...display, preset };
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

  const [incidents, setIncidents] = useState<WorkshopBoardIncident[] | null>(null);
  const [lines, setLines] = useState<WorkshopBoardLine[] | null>(null);
  const [now, setNow] = useState(new Date());
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [dataError, setDataError] = useState(false);
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
      setDataError(false);
    } catch {
      setDataError(true);
      // données précédentes conservées — stale-while-revalidate
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

  const safeIncidents = incidents ?? [];
  const safeLines = lines ?? [];

  const activeIncidents = useMemo(() => {
    const filtered = safeIncidents
      .filter((inc) => {
        if (settings.lineIds.length === 0) return true;
        if (settings.lineIds.includes(NO_LINES_SELECTED)) return false;
        return settings.lineIds.includes(String(inc.line_id));
      })
      .filter((inc) => !settings.onlyPriority || inc.is_priority)
      .filter((inc) => !settings.onlyNotTaken || !inc.is_taken);
    return sortIncidents(filtered);
  }, [safeIncidents, settings.lineIds, settings.onlyNotTaken, settings.onlyPriority]);

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
  const incidentPages = paginate(activeView === 'alerts' ? alertIncidents : activeIncidents, settings.rowsPerPage);
  const linePages = paginate(lineGroups, settings.rowsPerPage);
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
  }, [viewIndex, safeIncidents.length]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPageIndex((currentPage) => {
        const nextPage = currentPage + 1;
        if (nextPage < pages.length) return nextPage;
        setViewIndex((currentView) => (currentView + 1) % safeViews.length);
        return 0;
      });
    }, settings.viewDurationSec * 1000);
    return () => window.clearInterval(timer);
  }, [pages.length, safeViews.length, settings.viewDurationSec]);

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
      const allLineIds = safeLines.map((line) => String(line.id));
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
          <button className="board-exit" onClick={() => setShowSettings(true)} aria-label="Réglages">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'middle' }}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            Réglages
          </button>
          {user ? (
            <button className="board-exit" onClick={() => void navigate('/workshop/dashboard')} aria-label="Tableau de bord">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'middle' }}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              Tableau de bord
            </button>
          ) : (
            <button className="board-exit" onClick={() => void closeBoardAccess()} aria-label="Quitter">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 6, verticalAlign: 'middle' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Quitter
            </button>
          )}
        </div>
      </header>

      {dataError && <div className="board-error">Données temporairement indisponibles{lastUpdated ? ` — dernière mise à jour à ${formatTime(lastUpdated.toISOString())}` : ''}</div>}

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

      {!settings.compactMetrics && (
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
      )}

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
            <div className="notice">Paramètres locaux — écran {screenLabel} uniquement.</div>

            <section className="board-settings-section">
              <div>
                <h3>Profil d'écran</h3>
                <p>Scénario prédéfini ou configuration manuelle.</p>
              </div>
              <div className="form-group">
                <label className="form-label">Type d'écran</label>
                <SelectField
                  value={draftSettings.preset}
                  onChange={(value) => setDraftSettings(applyPreset(value as BoardPreset, draftSettings))}
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
                <h3>Affichage</h3>
                <p>Cadence de rotation et densité d'affichage.</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span>Vitesse de rotation</span>
                    <strong>{draftSettings.viewDurationSec} s</strong>
                  </label>
                  <input
                    type="range"
                    min={5} max={60} step={5}
                    value={draftSettings.viewDurationSec}
                    onChange={(e) => updateDraftSettings({ viewDurationSec: Number(e.target.value) })}
                    style={{ width: '100%' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 2 }}>
                    <span>5 s (rapide)</span>
                    <span>60 s (lent)</span>
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Incidents par page</label>
                  <SelectField
                    value={String(draftSettings.rowsPerPage)}
                    onChange={(v) => updateDraftSettings({ rowsPerPage: Number(v) })}
                    options={[
                      { value: '4', label: '4 lignes — petit écran' },
                      { value: '6', label: '6 lignes — standard' },
                      { value: '8', label: '8 lignes — grand écran' },
                      { value: '10', label: '10 lignes — très grand écran' },
                    ]}
                  />
                </div>
                <label className="board-line-option">
                  <input
                    type="checkbox"
                    checked={draftSettings.compactMetrics}
                    onChange={(e) => updateDraftSettings({ compactMetrics: e.target.checked })}
                  />
                  Masquer les compteurs (mode compact)
                </label>
              </div>
            </section>

            <section className="board-settings-section">
              <div>
                <h3>Contenu</h3>
                <p>Vues incluses dans la rotation automatique.</p>
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
                <p>Restriction du périmètre affiché sur cet écran.</p>
              </div>
              <div className="board-setting-options board-setting-options--col">
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
                  {safeLines.map((line) => {
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
                      {safeLines
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
