import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getBoardData, logoutBoardSession } from '../api/board';
import { ApiResponseError } from '../api/client';
import { useMutationRunner } from '../components/ui/MutationFeedback';
import Modal from '../components/Modal';
import SelectField from '../components/ui/SelectField';
import BoardIncidentGrid, { BoardEmptyState } from '../components/board/BoardIncidentGrid';
import BoardLineGrid, { LineGroup } from '../components/board/BoardLineGrid';
import { getUnifiedMe } from '../api/unifiedAuth';
import { WorkshopBoardIncident, WorkshopBoardLine } from '../types';
import { sortIncidents } from '../utils/incidentSort';
import {
  formatClock,
  formatStaleDuration,
  formatTime,
  getOrCreateSessionScreenId,
  isOpenOverSevenDays,
  normalizeScreenId,
  paginate,
} from '../utils/boardUtils';
import { usePageTitle } from '../hooks/usePageTitle';
import ErrorBanner from '../components/ui/ErrorBanner';
import { inflect } from '../utils/french';

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
const EMPTY_INCIDENTS: WorkshopBoardIncident[] = [];
const DEFAULT_SETTINGS: BoardSettings = {
  preset: 'default',
  showAlerts: true,
  showOpenCases: true,
  showLineSummary: true,
  onlyPriority: false,
  onlyNotTaken: false,
  lineIds: [],
  viewDurationSec: 10,
  rowsPerPage: 6,
  compactMetrics: false,
};
const PRESET_LABELS: Record<BoardPreset, string> = {
  default: 'Standard',
  maintenance: 'Technicien',
  responsable: 'Responsables',
  custom: 'Personnalisé',
};
const BOARD_PRESETS = new Set<BoardPreset>(['default', 'maintenance', 'responsable', 'custom']);
const BOARD_PAGE_SIZES = new Set([4, 6, 8, 10]);

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeBoardSettings(value: unknown): BoardSettings {
  if (!value || typeof value !== 'object') return DEFAULT_SETTINGS;
  const parsed = value as Partial<Record<keyof BoardSettings, unknown>>;
  const preset =
    typeof parsed.preset === 'string' && BOARD_PRESETS.has(parsed.preset as BoardPreset)
      ? (parsed.preset as BoardPreset)
      : DEFAULT_SETTINGS.preset;
  const viewDuration = Number(parsed.viewDurationSec);
  const rowsPerPage = Number(parsed.rowsPerPage);
  const lineIds = Array.isArray(parsed.lineIds)
    ? parsed.lineIds
        .filter((lineId): lineId is string => typeof lineId === 'string')
        .map((lineId) => lineId.slice(0, 64))
        .slice(0, 100)
    : [];

  return {
    preset,
    showAlerts: asBoolean(parsed.showAlerts, DEFAULT_SETTINGS.showAlerts),
    showOpenCases: asBoolean(parsed.showOpenCases, DEFAULT_SETTINGS.showOpenCases),
    showLineSummary: asBoolean(parsed.showLineSummary, DEFAULT_SETTINGS.showLineSummary),
    onlyPriority: asBoolean(parsed.onlyPriority, DEFAULT_SETTINGS.onlyPriority),
    onlyNotTaken: asBoolean(parsed.onlyNotTaken, DEFAULT_SETTINGS.onlyNotTaken),
    lineIds,
    viewDurationSec:
      Number.isFinite(viewDuration) && viewDuration >= 5 && viewDuration <= 60
        ? Math.round(viewDuration / 5) * 5
        : DEFAULT_SETTINGS.viewDurationSec,
    rowsPerPage: BOARD_PAGE_SIZES.has(rowsPerPage) ? rowsPerPage : DEFAULT_SETTINGS.rowsPerPage,
    compactMetrics: asBoolean(parsed.compactMetrics, DEFAULT_SETTINGS.compactMetrics),
  };
}

function getBoardSettingsKey(screenId: string): string {
  return `${BOARD_SETTINGS_KEY}.${screenId}`;
}

function loadBoardSettings(storageKey: string): BoardSettings {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_SETTINGS;
    return normalizeBoardSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveBoardSettings(storageKey: string, settings: BoardSettings): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

function applyPreset(preset: BoardPreset, current: BoardSettings): BoardSettings {
  const display = {
    viewDurationSec: current.viewDurationSec,
    rowsPerPage: current.rowsPerPage,
    compactMetrics: current.compactMetrics,
  };
  if (preset === 'maintenance') {
    return {
      ...DEFAULT_SETTINGS,
      ...display,
      preset,
      showAlerts: true,
      showOpenCases: false,
      showLineSummary: false,
    };
  }
  if (preset === 'responsable') {
    return {
      ...DEFAULT_SETTINGS,
      ...display,
      preset,
      showAlerts: false,
      showOpenCases: false,
      showLineSummary: true,
    };
  }
  return { ...DEFAULT_SETTINGS, ...display, preset };
}

export default function WorkshopBoardPage() {
  const mutation = useMutationRunner();
  usePageTitle('Tableau temps réel');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // /board est une route publique : AppAuthContext n'y charge pas la session.
  // On détecte localement un utilisateur atelier connecté (échec silencieux
  // pour un écran kiosque sans session) pour afficher le retour dashboard.
  const [isWorkshopUser, setIsWorkshopUser] = useState(false);
  const exitButtonRef = useRef<HTMLButtonElement | null>(null);
  const logoutPending = mutation.isPending('auth:board:logout');
  const logoutFailed = mutation.errorKey === 'auth:board:logout';

  useEffect(() => {
    if (!logoutPending && logoutFailed && exitButtonRef.current?.isConnected) {
      exitButtonRef.current.focus({ preventScroll: true });
    }
  }, [logoutFailed, logoutPending]);

  useEffect(() => {
    const controller = new AbortController();
    void getUnifiedMe(controller.signal)
      .then((me) => {
        if (!controller.signal.aborted && me.accountType === 'workshop') setIsWorkshopUser(true);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
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
  const [settingsError, setSettingsError] = useState('');
  const [settings, setSettings] = useState<BoardSettings>(() => loadBoardSettings(storageKey));
  const [draftSettings, setDraftSettings] = useState<BoardSettings>(() =>
    loadBoardSettings(storageKey)
  );
  const refreshControllerRef = useRef<AbortController | null>(null);

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

  const refreshBoard = useCallback(async () => {
    if (refreshControllerRef.current) return;
    const controller = new AbortController();
    refreshControllerRef.current = controller;
    try {
      const boardData = await getBoardData(controller.signal);
      if (controller.signal.aborted) return;
      setIncidents(boardData.incidents);
      setLines(boardData.lines);
      setLastUpdated(new Date());
      setDataError(false);
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ApiResponseError && err.status === 401) {
        // Session board révoquée ou board désactivé — retour à l'accueil
        await logoutBoardSession().catch(() => undefined);
        void navigate('/login', {
          replace: true,
          state: { reason: 'Session board expirée ou révoquée.' },
        });
        return;
      }
      setDataError(true);
    } finally {
      if (refreshControllerRef.current === controller) refreshControllerRef.current = null;
    }
  }, [navigate]);

  useEffect(() => {
    void refreshBoard();
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === 'visible') void refreshBoard();
    };
    const refreshId = window.setInterval(refreshWhenVisible, 30000);
    const clockId = window.setInterval(() => setNow(new Date()), 15000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      const controller = refreshControllerRef.current;
      refreshControllerRef.current = null;
      controller?.abort();
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshBoard]);

  useEffect(() => {
    const nextSettings = loadBoardSettings(storageKey);
    setSettings(nextSettings);
    setDraftSettings(nextSettings);
    setViewIndex(0);
    setPageIndex(0);
  }, [storageKey]);

  const safeIncidents = incidents ?? EMPTY_INCIDENTS;
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
  const incidentPages = paginate(
    activeView === 'alerts' ? alertIncidents : activeIncidents,
    settings.rowsPerPage
  );
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

  async function saveSettings() {
    setSettingsError('');
    await mutation.execute(
      () => {
        if (!saveBoardSettings(storageKey, draftSettings)) {
          throw new Error('BOARD_SETTINGS_STORAGE_FAILED');
        }
        return Promise.resolve(normalizeBoardSettings(draftSettings));
      },
      {
        key: 'board:settings:save',
        successMessage: 'Paramètres d’affichage enregistrés.',
        errorPresentation: 'local',
        toErrorMessage: () => "Impossible d'enregistrer les paramètres sur cet écran.",
        onSuccess: (nextSettings) => {
          setSettings(nextSettings);
          setShowSettings(false);
        },
        onError: (_err, safeMessage) => setSettingsError(safeMessage),
      }
    );
  }

  async function closeBoardAccess() {
    await mutation.execute(logoutBoardSession, {
      key: 'auth:board:logout',
      toErrorMessage: () => 'Impossible de quitter le Board. Réessayez.',
      onSuccess: () => void navigate('/login', { replace: true }),
    });
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
      return {
        ...prev,
        lineIds: nextIds.length === 0 ? [NO_LINES_SELECTED] : nextIds,
        preset: 'custom',
      };
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
    <main
      id="main-content"
      className={`board-page board-page-${boardMode}${dataError ? ' board-page--stale' : ''}`}
    >
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
          <button
            className="board-exit"
            onClick={() => {
              setSettingsError('');
              setShowSettings(true);
            }}
            aria-label="Réglages"
            disabled={dataError}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              style={{ marginRight: 6, verticalAlign: 'middle' }}
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Réglages
          </button>
          {isWorkshopUser ? (
            <button
              className="board-exit"
              onClick={() => void navigate('/workshop/dashboard')}
              aria-label="Tableau de bord"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ marginRight: 6, verticalAlign: 'middle' }}
              >
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="14" y="14" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
              Tableau de bord
            </button>
          ) : (
            <button
              ref={exitButtonRef}
              className="board-exit"
              onClick={() => void closeBoardAccess()}
              aria-label="Quitter"
              disabled={logoutPending}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ marginRight: 6, verticalAlign: 'middle' }}
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              {logoutPending ? 'Déconnexion…' : 'Quitter'}
            </button>
          )}
        </div>
      </header>

      {dataError && (
        <div className="board-stale-banner" role="alert">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span>
            Hors ligne — dernière synchronisation
            {lastUpdated ? ` il y a ${formatStaleDuration(lastUpdated, now)}` : ' inconnue'}
          </span>
        </div>
      )}

      <section className="board-status-panel">
        <div className="board-status-copy">
          <span>{boardModeLabel}</span>
          <strong>{boardModeTitle}</strong>
          {noLineScope && <p>Aucune ligne n'est incluse dans les paramètres de cet écran.</p>}
        </div>
        <div className="board-status-meta">
          <span>Écran {screenLabel}</span>
          <span>
            {viewTitle} · Page {safePageIndex + 1}/{pages.length}
          </span>
        </div>
      </section>

      <section
        className={`board-metrics${settings.compactMetrics ? ' board-metrics--hidden' : ''}`}
        aria-hidden={settings.compactMetrics}
      >
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
            setSettingsError('');
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
              <button
                className="btn btn-primary"
                onClick={() => void saveSettings()}
                disabled={mutation.isPending('board:settings:save')}
              >
                {mutation.isPending('board:settings:save') ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          }
        >
          <div className="board-settings-panel">
            {settingsError && <ErrorBanner>{settingsError}</ErrorBanner>}
            <div className="notice">Paramètres locaux — écran {screenLabel} uniquement.</div>

            <section className="board-settings-section">
              <div>
                <h3>Profil d'écran</h3>
                <p>Scénario prédéfini ou configuration manuelle.</p>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="board-screen-preset">
                  Type d'écran
                </label>
                <SelectField
                  id="board-screen-preset"
                  value={draftSettings.preset}
                  onChange={(value) =>
                    setDraftSettings(applyPreset(value as BoardPreset, draftSettings))
                  }
                  options={[
                    { value: 'default', label: `${PRESET_LABELS.default} · rotation complète` },
                    {
                      value: 'maintenance',
                      label: `${PRESET_LABELS.maintenance} · alertes à traiter`,
                    },
                    {
                      value: 'responsable',
                      label: `${PRESET_LABELS.responsable} · situation par ligne`,
                    },
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
                  <label
                    className="form-label"
                    htmlFor="board-view-duration"
                    style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}
                  >
                    <span>Vitesse de rotation</span>
                    <strong>{draftSettings.viewDurationSec} s</strong>
                  </label>
                  <input
                    id="board-view-duration"
                    type="range"
                    aria-label="Vitesse de rotation"
                    min={5}
                    max={60}
                    step={5}
                    value={draftSettings.viewDurationSec}
                    onChange={(e) =>
                      updateDraftSettings({ viewDurationSec: Number(e.target.value) })
                    }
                    style={{ width: '100%' }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-muted)',
                      marginTop: 2,
                    }}
                  >
                    <span>5 s (rapide)</span>
                    <span>60 s (lent)</span>
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" htmlFor="board-rows-per-page">
                    Incidents par page
                  </label>
                  <SelectField
                    id="board-rows-per-page"
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
                        : `${draftSettings.lineIds.length} ${inflect(
                            draftSettings.lineIds.length,
                            'ligne sélectionnée',
                            'lignes sélectionnées'
                          )}`}
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
                      {draftSettings.lineIds.length}{' '}
                      {inflect(draftSettings.lineIds.length, 'ligne affichée', 'lignes affichées')}{' '}
                      :{' '}
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
