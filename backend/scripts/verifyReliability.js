const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

const checks = [];

function check(name, test) {
  checks.push({ name, test });
}

function includesInOrder(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex !== -1 && secondIndex !== -1 && firstIndex < secondIndex;
}

check('Board API is public and detailed workshop APIs are protected', () => {
  const routes = read('backend/src/modules/workshop/workshop.routes.ts');
  return includesInOrder(routes, "router.get('/board', getBoardData)", 'router.use(workshopAuthMiddleware)')
    && includesInOrder(routes, 'router.use(workshopAuthMiddleware)', "router.get('/incidents', listIncidents)")
    && includesInOrder(routes, 'router.use(workshopAuthMiddleware)', "router.get('/history/incidents', listHistoryIncidents)")
    && includesInOrder(routes, 'router.use(workshopAuthMiddleware)', "router.get('/history/events', listHistoryEvents)")
    && includesInOrder(routes, 'router.use(workshopAuthMiddleware)', "router.get('/knowledge/incidents', listKnowledgeIncidents)")
    && includesInOrder(routes, 'router.use(workshopAuthMiddleware)', "router.get('/metrics', getIncidentMetrics)")
    && includesInOrder(routes, 'router.use(workshopAuthMiddleware)', "router.get('/analytics', getWorkshopAnalytics)");
});

check('Workshop middleware revalidates active user and current role from database', () => {
  const middleware = read('backend/src/middlewares/workshopAuth.ts');
  return middleware.includes('FROM sentinel_users')
    && middleware.includes('is_active = TRUE')
    && middleware.includes('is_deleted = FALSE')
    && middleware.includes('role: user.role')
    && middleware.includes('!user.password_hash');
});

check('Admin cannot remove active operational references', () => {
  const accounts = read('backend/src/modules/accounts/accounts.controller.ts');
  const lines = read('backend/src/modules/lines/lines.controller.ts');
  return accounts.includes('getActiveTakenIncidentCountForUser')
    && accounts.includes('RESOURCE_IN_USE')
    && accounts.includes("status IN ('OPEN', 'PENDING')")
    && lines.includes('getActiveIncidentCountForLine')
    && lines.includes('RESOURCE_IN_USE')
    && lines.includes("status IN ('OPEN', 'PENDING')");
});

check('Workshop permissions are mirrored backend/frontend', () => {
  const controller = read('backend/src/modules/workshop/workshop.controller.ts');
  const permissions = read('frontend/src/utils/workshopPermissions.ts');
  return controller.includes("case 'REQUEST_CANCEL':")
    && controller.includes("!incident.is_taken")
    && controller.includes("case 'APPROVE_CANCEL':")
    && controller.includes('incident.delete_request === true')
    && permissions.includes("case 'requestCancel':")
    && permissions.includes('!incident.is_taken')
    && permissions.includes("case 'approveCancel':")
    && permissions.includes('incident.delete_request === true');
});

check('Canceled incidents are preserved but excluded from operational metrics', () => {
  const controller = read('backend/src/modules/workshop/workshop.controller.ts');
  return controller.includes("SET status = 'CANCELED'")
    && controller.includes("COUNT(*) FILTER (WHERE status IN ('OPEN', 'PENDING'))::int AS total")
    && controller.includes("WHERE status = 'CLOSED'")
    && controller.includes("wi.status != 'CANCELED'");
});

check('Board frontend consumes only the public board endpoint', () => {
  const board = read('frontend/src/pages/WorkshopBoardPage.tsx');
  const api = read('frontend/src/api/workshop.ts');
  return board.includes('getWorkshopBoardData')
    && !board.includes('listWorkshopIncidents')
    && !board.includes('getIncidentMetrics')
    && api.includes("'/api/workshop/board'");
});

check('Board respects responsible manual ordering after priority', () => {
  const controller = read('backend/src/modules/workshop/workshop.controller.ts');
  const board = read('frontend/src/pages/WorkshopBoardPage.tsx');
  return controller.includes('ORDER BY is_priority DESC, display_order DESC, is_taken ASC, created_at DESC')
    && includesInOrder(board, 'if (a.is_priority !== b.is_priority)', 'if (a.display_order !== b.display_order)')
    && includesInOrder(board, 'if (a.display_order !== b.display_order)', 'if (a.is_taken !== b.is_taken)');
});

check('Board settings are scoped per display screen', () => {
  const board = read('frontend/src/pages/WorkshopBoardPage.tsx');
  return board.includes('BOARD_SESSION_SCREEN_KEY')
    && board.includes('getOrCreateSessionScreenId')
    && board.includes("nextParams.set('screen', screenId)")
    && board.includes('getBoardSettingsKey(screenId)')
    && !board.includes("storageKey.endsWith('.default')");
});

check('Routing keeps board public and workshop workspaces protected', () => {
  const app = read('frontend/src/App.tsx');
  return app.includes('path="/workshop/board"')
    && app.includes('<WorkshopBoardPage />')
    && app.includes('path="/workshop/dashboard"')
    && app.includes('<WorkshopProtectedRoute>')
    && app.includes('path="/workshop/pilotage"')
    && app.includes('path="/workshop/history"')
    && app.includes('path="/workshop/knowledge"');
});

check('Workshop history, pilotage, and knowledge are separated pages', () => {
  const pilotage = read('frontend/src/pages/WorkshopPilotagePage.tsx');
  const history = read('frontend/src/pages/WorkshopHistoryPage.tsx');
  const knowledge = read('frontend/src/pages/WorkshopKnowledgePage.tsx');
  const api = read('frontend/src/api/workshop.ts');
  const controller = read('backend/src/modules/workshop/workshop.controller.ts');
  return pilotage.includes('getWorkshopAnalytics')
    && !pilotage.includes('mode=')
    && history.includes('listWorkshopHistoryIncidents')
    && history.includes('listWorkshopHistoryEvents')
    && history.includes('listIncidentEvents')
    && !history.includes('listWorkshopIncidents')
    && !history.includes('getWorkshopAnalytics')
    && knowledge.includes('listWorkshopKnowledgeIncidents')
    && !knowledge.includes('listWorkshopIncidents')
    && !knowledge.includes('listIncidentEvents')
    && api.includes('/api/workshop/history/incidents')
    && api.includes('/api/workshop/history/events')
    && api.includes('/api/workshop/knowledge/incidents')
    && controller.includes("wi.status = 'CLOSED'")
    && controller.includes("wi.intervention_note IS NOT NULL");
});

check('Workshop knowledge page presents validated intervention cards', () => {
  const knowledge = read('frontend/src/pages/WorkshopKnowledgePage.tsx');
  const styles = read('frontend/src/styles.css');
  return knowledge.includes('knowledge-card-list')
    && knowledge.includes('knowledge-detail')
    && knowledge.includes('Solution / intervention validée')
    && knowledge.includes('selectedIncident.intervention_note')
    && styles.includes('.knowledge-layout')
    && styles.includes('.knowledge-section-primary');
});

check('Workshop pilotage exposes period trend indicators', () => {
  const controller = read('backend/src/modules/workshop/workshop.controller.ts');
  const types = read('frontend/src/types/index.ts');
  const pilotage = read('frontend/src/pages/WorkshopPilotagePage.tsx');
  const styles = read('frontend/src/styles.css');
  return controller.includes('trendRows')
    && controller.includes('created_count')
    && controller.includes('closed_count')
    && controller.includes('oldest_active_seconds')
    && types.includes('trend: {')
    && pilotage.includes('Temps réel')
    && pilotage.includes('Recensement')
    && pilotage.includes('Analyse & bilan')
    && pilotage.includes('Faits constatés sur la période')
    && pilotage.includes('Lecture exploitable en réunion')
    && pilotage.includes('Tendance quotidienne')
    && pilotage.includes('trendSummary')
    && pilotage.includes('Lecture rapide')
    && pilotage.includes('renderComparisonBars')
    && pilotage.includes('Taux de clôture')
    && !pilotage.includes('donut')
    && styles.includes('.pilotage-insight-grid')
    && styles.includes('.pilotage-section')
    && styles.includes('.pilotage-summary-card')
    && styles.includes('.comparison-list')
    && styles.includes('.trend-bar-created');
});

check('Workshop knowledge and history are cross-linked by incident trace', () => {
  const routes = read('backend/src/modules/workshop/workshop.routes.ts');
  const api = read('frontend/src/api/workshop.ts');
  const history = read('frontend/src/pages/WorkshopHistoryPage.tsx');
  const knowledge = read('frontend/src/pages/WorkshopKnowledgePage.tsx');
  const styles = read('frontend/src/styles.css');
  return routes.includes("router.get('/history/incidents/:id', getHistoryIncident)")
    && routes.includes("router.get('/knowledge/incidents/:id', getKnowledgeIncident)")
    && api.includes('getWorkshopHistoryIncident')
    && api.includes('getWorkshopKnowledgeIncident')
    && history.includes('useSearchParams')
    && history.includes("searchParams.get('incident')")
    && history.includes('/workshop/knowledge?incident=')
    && history.includes('inline-link-button')
    && knowledge.includes('useSearchParams')
    && knowledge.includes('getWorkshopKnowledgeIncident')
    && knowledge.includes('/workshop/history?incident=')
    && styles.includes('.inline-link-button')
    && styles.includes('.knowledge-actions')
    && styles.includes('.history-header-actions');
});

check('Workshop history and knowledge filters are URL-restorable', () => {
  const history = read('frontend/src/pages/WorkshopHistoryPage.tsx');
  const knowledge = read('frontend/src/pages/WorkshopKnowledgePage.tsx');
  const styles = read('frontend/src/styles.css');
  return history.includes("searchParams.get('q')")
    && history.includes("searchParams.get('status')")
    && history.includes("searchParams.get('line')")
    && history.includes("searchParams.get('machine')")
    && history.includes("searchParams.get('state')")
    && history.includes("searchParams.get('event')")
    && history.includes('updateSearchFilter')
    && history.includes('updateLineFilter')
    && knowledge.includes("searchParams.get('q')")
    && knowledge.includes("searchParams.get('line')")
    && knowledge.includes("searchParams.get('machine')")
    && knowledge.includes("searchParams.get('state')")
    && knowledge.includes('updateSearchFilter')
    && knowledge.includes('updateLineFilter')
    && history.includes('clearFilters')
    && knowledge.includes('clearFilters')
    && history.includes('FilterSummary')
    && knowledge.includes('FilterSummary')
    && styles.includes('.filter-summary')
    && styles.includes('.filter-chip');
});

check('Modal base protects sensitive and dirty flows consistently', () => {
  const modal = read('frontend/src/components/Modal.tsx');
  const styles = read('frontend/src/styles.css');
  const createIncident = read('frontend/src/components/CreateIncidentModal.tsx');
  const createLine = read('frontend/src/components/CreateLineModal.tsx');
  const editMachine = read('frontend/src/components/EditMachineModal.tsx');
  const deleteUser = read('frontend/src/components/DeleteConfirmModal.tsx');
  const invalidate = read('frontend/src/components/InvalidateIncidentModal.tsx');
  return modal.includes('isDirty')
    && modal.includes('isLoading')
    && modal.includes('closeOnEscape')
    && modal.includes('modal-confirm-overlay')
    && modal.includes('modal-danger')
    && styles.includes('.modal-confirm-overlay')
    && styles.includes('.modal-lg')
    && createIncident.includes('isDirty={isDirty}')
    && createIncident.includes('closeOnOverlay={false}')
    && createLine.includes('size="lg"')
    && editMachine.includes('isLoading={loading}')
    && deleteUser.includes('variant="danger"')
    && invalidate.includes('variant="danger"');
});

check('Database constraints and indexes harden core workshop integrity', () => {
  const migration = read('backend/migrations/015_harden_workshop_integrity.sql');
  return migration.includes('chk_sentinel_users_role')
    && migration.includes('chk_workshop_incidents_shift')
    && migration.includes('chk_workshop_incidents_state')
    && migration.includes('chk_workshop_incidents_status')
    && migration.includes('idx_workshop_incidents_board_order')
    && migration.includes('idx_workshop_incidents_taken_active')
    && migration.includes('idx_workshop_incident_events_type_created');
});

check('Workshop event log has payloads for important operational decisions', () => {
  const controller = read('backend/src/modules/workshop/workshop.controller.ts');
  return controller.includes('INCIDENT_CREATED')
    && controller.includes('EDIT_REQUESTED')
    && controller.includes('EDIT_APPLIED')
    && controller.includes('CANCEL_REQUESTED')
    && controller.includes('INCIDENT_CANCELED')
    && controller.includes('INCIDENT_INVALIDATED')
    && controller.includes('STATUS_CHANGED')
    && controller.includes('RESPONSIBLE_COMMENT_UPDATED')
    && controller.includes('requestedChangeKeys');
});

let failures = 0;

for (const item of checks) {
  let passed = false;
  try {
    passed = Boolean(item.test());
  } catch (err) {
    passed = false;
  }

  if (passed) {
    console.log(`OK ${item.name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${item.name}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} reliability check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} reliability checks passed.`);
