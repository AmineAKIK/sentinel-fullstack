const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readMany(relativePaths) {
  return relativePaths.map(read).join('\n');
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

check(
  'Board API requires board or workshop session and detailed workshop APIs are protected',
  () => {
    const routes = read('backend/src/modules/workshop/workshop.routes.ts');
    const board = read('backend/src/modules/board/board.auth.ts');
    const server = read('backend/src/server.ts');
    const production = read('backend/src/config/production.ts');
    return (
      !routes.includes("router.get('/board'") &&
      board.includes('BOARD_AUTH_COOKIE') &&
      board.includes("res.setHeader('Cache-Control', 'no-store')") &&
      board.includes("boardRouter.post('/session'") &&
      board.includes("boardRouter.get('/data', boardReadAuthMiddleware, getBoardData)") &&
      server.includes("app.use('/api/board/session', loginRateLimit)") &&
      server.includes("app.use('/api/board', boardRouter)") &&
      production.includes("'BOARD_ACCESS_CODE_HASH'") &&
      production.includes('BCRYPT_HASH_PATTERN') &&
      includesInOrder(
        routes,
        'router.use(workshopAuthMiddleware)',
        "router.get('/incidents', listIncidents)"
      ) &&
      includesInOrder(
        routes,
        'router.use(workshopAuthMiddleware)',
        "router.get('/history/incidents', listHistoryIncidents)"
      ) &&
      includesInOrder(
        routes,
        'router.use(workshopAuthMiddleware)',
        "router.get('/history/events', listHistoryEvents)"
      ) &&
      includesInOrder(
        routes,
        'router.use(workshopAuthMiddleware)',
        "router.get('/knowledge/incidents', listKnowledgeIncidents)"
      ) &&
      includesInOrder(
        routes,
        'router.use(workshopAuthMiddleware)',
        "router.get('/metrics', getIncidentMetrics)"
      ) &&
      includesInOrder(
        routes,
        'router.use(workshopAuthMiddleware)',
        "router.get('/analytics', getWorkshopAnalytics)"
      )
    );
  }
);

check('Workshop middleware revalidates active user and current role from database', () => {
  const middleware = read('backend/src/middlewares/workshopAuth.ts');
  return (
    middleware.includes('FROM sentinel_users') &&
    middleware.includes('is_active = TRUE') &&
    middleware.includes('is_deleted = FALSE') &&
    middleware.includes('role: user.role') &&
    middleware.includes('password_hash IS NOT NULL')
  );
});

check('Admin cannot remove active operational references', () => {
  const accounts = read('backend/src/modules/accounts/accounts.service.ts');
  const accountsRepo = read('backend/src/modules/accounts/accounts.repository.ts');
  const lines = read('backend/src/modules/lines/lines.service.ts');
  const linesRepo = read('backend/src/modules/lines/lines.repository.ts');
  const constants = read('backend/src/domain/constants.ts');
  return (
    accounts.includes('getActiveTakenIncidentCountForUser') &&
    accounts.includes('RESOURCE_IN_USE') &&
    accountsRepo.includes('getActiveTakenIncidentCountForUser') &&
    accountsRepo.includes('ACTIVE_INCIDENT_STATUSES') &&
    lines.includes('getActiveIncidentCountForLine') &&
    lines.includes('RESOURCE_IN_USE') &&
    linesRepo.includes('getActiveIncidentCountForLine') &&
    linesRepo.includes('ACTIVE_INCIDENT_STATUSES') &&
    constants.includes("'OPEN', 'PENDING'")
  );
});

check('Workshop permissions are mirrored backend/frontend', () => {
  const policy = read('backend/src/modules/workshop/workshop.policy.ts');
  const permissions = read('frontend/src/utils/workshopPermissions.ts');
  return (
    policy.includes("case 'REQUEST_CANCEL':") &&
    policy.includes('!incident.is_taken') &&
    policy.includes("case 'APPROVE_CANCEL':") &&
    policy.includes('incident.cancel_request === true') &&
    permissions.includes("case 'requestCancel':") &&
    permissions.includes('!incident.is_taken') &&
    permissions.includes("case 'approveCancel':") &&
    permissions.includes('incident.cancel_request === true')
  );
});

check(
  'Canceled and invalidated incidents are preserved but excluded from operational metrics',
  () => {
    const repository = readMany([
      'backend/src/modules/workshop/workshop.repository.ts',
      'backend/src/modules/workshop/workshop.repository.analytics.ts',
    ]);
    return (
      repository.includes("SET status = 'CANCELED'") &&
      repository.includes("SET status = 'INVALIDATED'") &&
      repository.includes('COUNT(*) FILTER (WHERE ${activeIncidentStatusSql})::int AS total') &&
      repository.includes("statusEqualsSql('wi.status', 'CLOSED')") &&
      repository.includes('nonTerminalRejectedWorkshopIncidentStatusSql')
    );
  }
);

check('Board frontend consumes only the secured board endpoint', () => {
  const board = read('frontend/src/pages/WorkshopBoardPage.tsx');
  const api = read('frontend/src/api/board.ts');
  const workshopApi = read('frontend/src/api/workshop.ts');
  return (
    board.includes('getBoardData') &&
    !board.includes('getWorkshopBoardData') &&
    !board.includes('listWorkshopIncidents') &&
    !board.includes('getIncidentMetrics') &&
    api.includes("'/api/board/data'") &&
    !workshopApi.includes('getWorkshopBoardData') &&
    !workshopApi.includes("'/api/board/data'")
  );
});

check('Board respects responsible manual ordering after priority', () => {
  const repository = read('backend/src/modules/workshop/workshop.repository.ts');
  const board = readMany([
    'frontend/src/pages/WorkshopBoardPage.tsx',
    'frontend/src/utils/incidentSort.ts',
  ]);
  return (
    repository.includes(
      'ORDER BY is_priority DESC, display_order DESC, is_taken ASC, created_at DESC'
    ) &&
    includesInOrder(
      board,
      'if (a.is_priority !== b.is_priority)',
      'if (a.display_order !== b.display_order)'
    ) &&
    includesInOrder(
      board,
      'if (a.display_order !== b.display_order)',
      'if (a.is_taken !== b.is_taken)'
    )
  );
});

check('Board settings are scoped per display screen', () => {
  const board = readMany([
    'frontend/src/pages/WorkshopBoardPage.tsx',
    'frontend/src/utils/boardUtils.ts',
  ]);
  return (
    board.includes('BOARD_SESSION_SCREEN_KEY') &&
    board.includes('getOrCreateSessionScreenId') &&
    board.includes("nextParams.set('screen', screenId)") &&
    board.includes('getBoardSettingsKey(screenId)') &&
    !board.includes("storageKey.endsWith('.default')")
  );
});

check('Routing exposes a three-space portal and protects admin/workshop workspaces', () => {
  const app = read('frontend/src/App.tsx');
  const login = read('frontend/src/pages/LoginPage.tsx');
  const authContext = read('frontend/src/routes/AppAuthContext.tsx');
  return (
    app.includes('path="/login"') &&
    app.includes('path="/board"') &&
    app.includes('<BoardAccessPage />') &&
    app.includes('path="/admin/login"') &&
    app.includes('<AdminLoginPage />') &&
    app.includes('path="/workshop/login"') &&
    app.includes('<WorkshopLoginPage />') &&
    app.includes('<AdminRoute>') &&
    app.includes('<WorkshopRoute>') &&
    login.includes('/admin/login') &&
    login.includes('/workshop/login') &&
    login.includes('Tableau') &&
    login.includes('Administration') &&
    login.includes('Atelier') &&
    login.includes('login-space-grid') &&
    authContext.includes("'/login'") &&
    authContext.includes("'/board'") &&
    authContext.includes("'/admin/login'") &&
    authContext.includes("'/workshop/login'") &&
    !app.includes('<WorkshopProtectedRoute>') &&
    !app.includes('<PublicRoute>') &&
    !app.includes('path="/admin/acceuil"') &&
    !app.includes('path="/workshop"') &&
    !app.includes('path="/workshop/board"')
  );
});

check('Workshop navigation excludes board display', () => {
  const nav = read('frontend/src/components/WorkshopNavBar.tsx');
  return (
    !nav.includes('Affichage') &&
    !nav.includes('/workshop/board') &&
    nav.includes('/workshop/dashboard') &&
    nav.includes('/workshop/support')
  );
});

check('Official auth API exposes only the unified session entry', () => {
  const server = read('backend/src/server.ts');
  const adminSecurityRoutes = read('backend/src/modules/adminSecurity/adminSecurity.routes.ts');
  return (
    server.includes("app.use('/api/auth', authRoutes)") &&
    server.includes("app.use('/api/admin/security', adminSecurityRoutes)") &&
    !server.includes("app.use('/api/admin/auth'") &&
    !server.includes('adminAuthRoutes') &&
    !server.includes("app.use('/api/workshop/auth'") &&
    !adminSecurityRoutes.includes("router.post('/login'") &&
    !adminSecurityRoutes.includes("router.get('/me'") &&
    !adminSecurityRoutes.includes("router.post('/logout'")
  );
});

check('Legacy auth surfaces are removed', () => {
  const files = [
    'frontend/src/routes/AuthContext.tsx',
    'frontend/src/routes/ProtectedRoute.tsx',
    'frontend/src/routes/PublicRoute.tsx',
    'frontend/src/routes/WorkshopAuthContext.tsx',
    'frontend/src/routes/WorkshopProtectedRoute.tsx',
    'frontend/src/api/auth.ts',
    'frontend/src/api/workshopAuth.ts',
    'backend/src/modules/adminAuth',
    'backend/src/modules/workshopAuth',
  ];
  return files.every((relativePath) => !fs.existsSync(path.join(repoRoot, relativePath)));
});

check('Workshop history, journal, pilotage, and knowledge are separated pages', () => {
  const pilotage = readMany([
    'frontend/src/pages/WorkshopPilotagePage.tsx',
    'frontend/src/hooks/usePilotageData.ts',
  ]);
  const history = readMany([
    'frontend/src/pages/WorkshopHistoryPage.tsx',
    'frontend/src/hooks/useHistoryData.ts',
  ]);
  const journal = readMany([
    'frontend/src/pages/WorkshopJournalPage.tsx',
    'frontend/src/hooks/useJournalData.ts',
  ]);
  const knowledge = readMany([
    'frontend/src/pages/WorkshopKnowledgePage.tsx',
    'frontend/src/hooks/useKnowledgeData.ts',
  ]);
  const api = read('frontend/src/api/workshop.ts');
  const repository = read('backend/src/modules/workshop/workshop.repository.ts');
  return (
    pilotage.includes('getWorkshopAnalytics') &&
    !pilotage.includes('mode=') &&
    history.includes('listWorkshopHistoryIncidents') &&
    history.includes('listIncidentEvents') &&
    !history.includes('listWorkshopIncidents') &&
    !history.includes('getWorkshopAnalytics') &&
    journal.includes('listWorkshopHistoryEvents') &&
    !journal.includes('listWorkshopHistoryIncidents') &&
    !journal.includes('listIncidentEvents') &&
    knowledge.includes('listWorkshopKnowledgeIncidents') &&
    !knowledge.includes('listWorkshopIncidents') &&
    !knowledge.includes('listIncidentEvents') &&
    api.includes('/api/workshop/history/incidents') &&
    api.includes('/api/workshop/history/events') &&
    api.includes('/api/workshop/knowledge/incidents') &&
    repository.includes("statusEqualsSql('wi.status', 'CLOSED')") &&
    repository.includes('wi.intervention_note IS NOT NULL')
  );
});

check('Workshop knowledge page presents validated intervention cards', () => {
  const knowledge = readMany([
    'frontend/src/pages/WorkshopKnowledgePage.tsx',
    'frontend/src/hooks/useKnowledgeData.ts',
  ]);
  const styles = read('frontend/src/styles/pages/knowledge.css');
  return (
    knowledge.includes('kb-card') &&
    knowledge.includes('kb-detail') &&
    knowledge.includes('Solution / intervention validée') &&
    knowledge.includes('incident.intervention_note') &&
    styles.includes('.kb-layout') &&
    styles.includes('.kb-section-solution')
  );
});

check('Workshop pilotage exposes period trend indicators', () => {
  const repository = read('backend/src/modules/workshop/workshop.repository.analytics.ts');
  const types = read('frontend/src/types/workshop.ts');
  const pilotage = readMany([
    'frontend/src/pages/WorkshopPilotagePage.tsx',
    'frontend/src/hooks/usePilotageData.ts',
    'frontend/src/components/pilotage/PilotageCharts.tsx',
  ]);
  const styles = read('frontend/src/styles/pages/pilotage.css');
  return (
    repository.includes('trendRows') &&
    repository.includes('created_count') &&
    repository.includes('closed_count') &&
    repository.includes('oldest_active_seconds') &&
    types.includes('trend: {') &&
    pilotage.includes('Temps réel') &&
    pilotage.includes('Bilan analytique') &&
    pilotage.includes('Indicateurs sur la période') &&
    pilotage.includes('Historique journalier') &&
    pilotage.includes('Créations et clôtures') &&
    pilotage.includes('trendSummary') &&
    pilotage.includes('<TrendChart') &&
    pilotage.includes('<Ranking') &&
    pilotage.includes('Taux de clôture') &&
    !pilotage.includes('donut') &&
    styles.includes('.pilotage-analytics-kpis') &&
    styles.includes('.pilotage-section') &&
    styles.includes('.pilotage-hotspot-grid') &&
    styles.includes('.pilotage-trend-bar-created')
  );
});

check('Workshop knowledge and history are cross-linked by incident trace', () => {
  const routes = read('backend/src/modules/workshop/workshop.routes.ts');
  const api = read('frontend/src/api/workshop.ts');
  const history = readMany([
    'frontend/src/pages/WorkshopHistoryPage.tsx',
    'frontend/src/hooks/useHistoryData.ts',
    'frontend/src/components/IncidentDossier.tsx',
  ]);
  const knowledge = readMany([
    'frontend/src/pages/WorkshopKnowledgePage.tsx',
    'frontend/src/hooks/useKnowledgeData.ts',
  ]);
  const styles = readMany([
    'frontend/src/styles/pages/history.css',
    'frontend/src/styles/pages/knowledge.css',
  ]);
  return (
    routes.includes("router.get('/history/incidents/:id', getHistoryIncident)") &&
    routes.includes("router.get('/knowledge/incidents/:id', getKnowledgeIncident)") &&
    api.includes('getWorkshopHistoryIncident') &&
    api.includes('getWorkshopKnowledgeIncident') &&
    history.includes('useSearchParams') &&
    history.includes("searchParams.get('incident')") &&
    history.includes('/workshop/knowledge?incident=') &&
    history.includes('history-knowledge-actions') &&
    knowledge.includes('useSearchParams') &&
    knowledge.includes('getWorkshopKnowledgeIncident') &&
    knowledge.includes('/workshop/history?incident=') &&
    styles.includes('.history-knowledge-actions') &&
    styles.includes('.kb-actions') &&
    styles.includes('.history-header-actions')
  );
});

check('Workshop history and knowledge filters are URL-restorable', () => {
  const history = readMany([
    'frontend/src/pages/WorkshopHistoryPage.tsx',
    'frontend/src/hooks/useHistoryData.ts',
  ]);
  const knowledge = readMany([
    'frontend/src/pages/WorkshopKnowledgePage.tsx',
    'frontend/src/hooks/useKnowledgeData.ts',
  ]);
  const styles = read('frontend/src/styles/base.css');
  return (
    history.includes("searchParams.get('q')") &&
    history.includes("searchParams.get('status')") &&
    history.includes("searchParams.get('line')") &&
    history.includes("searchParams.get('machine')") &&
    history.includes("searchParams.get('state')") &&
    history.includes("searchParams.get('event')") &&
    history.includes('updateSearchFilter') &&
    history.includes('updateLineFilter') &&
    knowledge.includes("searchParams.get('q')") &&
    knowledge.includes("searchParams.get('line')") &&
    knowledge.includes("searchParams.get('machine')") &&
    knowledge.includes("searchParams.get('state')") &&
    knowledge.includes('updateSearchFilter') &&
    knowledge.includes('updateLineFilter') &&
    history.includes('clearFilters') &&
    knowledge.includes('clearFilters') &&
    history.includes('FilterSummary') &&
    knowledge.includes('FilterSummary') &&
    styles.includes('.filter-summary') &&
    styles.includes('.filter-chip')
  );
});

check('Modal base protects sensitive and dirty flows consistently', () => {
  const modal = read('frontend/src/components/Modal.tsx');
  const styles = read('frontend/src/styles/responsive.css');
  const createIncident = read('frontend/src/components/CreateIncidentModal.tsx');
  const createLine = read('frontend/src/components/CreateLineModal.tsx');
  const editMachine = read('frontend/src/components/EditMachineModal.tsx');
  const deleteUser = read('frontend/src/components/DeleteConfirmModal.tsx');
  const invalidate = read('frontend/src/components/InvalidateIncidentModal.tsx');
  return (
    modal.includes('isDirty') &&
    modal.includes('isLoading') &&
    modal.includes('closeOnEscape') &&
    modal.includes('modal-confirm-overlay') &&
    modal.includes('modal-danger') &&
    styles.includes('.modal-confirm-overlay') &&
    styles.includes('.modal-lg') &&
    createIncident.includes('isDirty={isDirty}') &&
    createIncident.includes('closeOnOverlay={false}') &&
    createLine.includes('isDirty={isDirty}') &&
    createLine.includes('isLoading={loading}') &&
    editMachine.includes('isLoading={loading}') &&
    deleteUser.includes('hasActiveTakenIncidents') &&
    invalidate.includes('variant="danger"')
  );
});

check('Database constraints and indexes harden core workshop integrity', () => {
  const migration = read('backend/migrations/015_harden_workshop_integrity.sql');
  return (
    migration.includes('chk_sentinel_users_role') &&
    migration.includes('chk_workshop_incidents_state') &&
    migration.includes('chk_workshop_incidents_status') &&
    migration.includes('idx_workshop_incidents_board_order') &&
    migration.includes('idx_workshop_incidents_taken_active') &&
    migration.includes('idx_workshop_incident_events_type_created')
  );
});

check('Workshop event log has payloads for important operational decisions', () => {
  const service = readMany([
    'backend/src/modules/workshop/workshop.service.edit.ts',
    'backend/src/modules/workshop/workshop.service.mutations.ts',
  ]);
  const events = read('backend/src/modules/workshop/workshop.events.ts');
  const labels = read('frontend/src/utils/labels.ts');
  return (
    service.includes('INCIDENT_CREATED') &&
    service.includes('EDIT_REQUESTED') &&
    service.includes('EDIT_APPLIED') &&
    service.includes('CANCEL_REQUESTED') &&
    service.includes('INCIDENT_CANCELED') &&
    service.includes('INCIDENT_INVALIDATED') &&
    service.includes('INCIDENT_SET_PENDING') &&
    service.includes('INCIDENT_RESUMED') &&
    service.includes('INCIDENT_CLOSED') &&
    service.includes('PRIORITY_CHANGED') &&
    events.includes("'INCIDENT_REORDERED'") &&
    labels.includes('INCIDENT_REORDERED') &&
    service.includes('RESPONSIBLE_COMMENT_UPDATED') &&
    service.includes('requestedChangeKeys')
  );
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
