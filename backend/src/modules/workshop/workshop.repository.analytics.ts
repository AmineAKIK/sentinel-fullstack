import pool from '../../db/pool';
import { parseOptionalInt, statusInSql, statusEqualsSql } from '../../db/sql';
import { ACTIVE_INCIDENT_STATUSES, INCIDENT_STATUSES } from '../../domain/constants';

type QueryParams = Record<string, unknown>;

const activeIncidentStatusSql = statusInSql('status', ACTIVE_INCIDENT_STATUSES);
const openStatusSql = statusEqualsSql('status', 'OPEN');
const pendingStatusSql = statusEqualsSql('status', 'PENDING');
const closedStatusSql = statusEqualsSql('status', 'CLOSED');
const nonTerminalRejectedWorkshopIncidentStatusSql = statusInSql(
  'wi.status',
  INCIDENT_STATUSES.filter((status) => status !== 'CANCELED' && status !== 'INVALIDATED')
);

const INCIDENT_CRITICAL_AGE = `'7 days'`;
const INCIDENT_RECENT_AGE = `'24 hours'`;

export async function getWorkshopAnalytics(query: QueryParams) {
  const { start, end, lineId, machineId } = query;

  // Deux cohortes indépendantes sur la même fenêtre (DR-09) : « créés sur la
  // période » filtre par date de création, « clôturés sur la période » par
  // date de clôture. Elles partagent les mêmes filtres périmètre (ligne,
  // machine, statut non terminal rejeté) mais jamais la même colonne de date.
  const scopeFilters: string[] = [nonTerminalRejectedWorkshopIncidentStatusSql];
  const scopeParams: Array<string | number> = [];
  if (lineId) {
    const parsedLine = parseOptionalInt(lineId);
    if (parsedLine !== null) {
      scopeParams.push(parsedLine);
      scopeFilters.push(`wi.line_id = $${scopeParams.length}`);
    }
  }
  if (machineId) {
    scopeParams.push(String(machineId));
    scopeFilters.push(`wi.machine_id = $${scopeParams.length}`);
  }
  const scopeClause = scopeFilters.join(' AND ');

  const filters: string[] = [nonTerminalRejectedWorkshopIncidentStatusSql];
  const params: Array<string | number> = [];

  if (start) {
    params.push(String(start));
    filters.push(`wi.created_at >= $${params.length}`);
  }
  if (end) {
    params.push(String(end));
    filters.push(`wi.created_at <= $${params.length}`);
  }
  if (lineId) {
    const parsedLine = parseOptionalInt(lineId);
    if (parsedLine !== null) {
      params.push(parsedLine);
      filters.push(`wi.line_id = $${params.length}`);
    }
  }
  if (machineId) {
    params.push(String(machineId));
    filters.push(`wi.machine_id = $${params.length}`);
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  // Cohorte « clôturés sur la période », indépendante de la date de création
  // de l'incident : mêmes filtres périmètre, mais bornage sur we.created_at
  // (date de l'événement INCIDENT_CLOSED), pas sur wi.created_at.
  const closedScopeFilters: string[] = [scopeClause];
  const closedScopeParams: Array<string | number> = [...scopeParams];
  if (start) {
    closedScopeParams.push(String(start));
    closedScopeFilters.push(`we.created_at >= $${closedScopeParams.length}`);
  }
  if (end) {
    closedScopeParams.push(String(end));
    closedScopeFilters.push(`we.created_at <= $${closedScopeParams.length}`);
  }
  const closedWhereClause = `WHERE ${closedScopeFilters.join(' AND ')}`;

  const [
    { rows: totalsRows },
    { rows: stateRows },
    { rows: lineRows },
    { rows: machineRows },
    { rows: closeRows },
    { rows: createdTrendRows },
    { rows: closedTrendRows },
  ] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE ${statusInSql(
           'status',
           INCIDENT_STATUSES.filter((status) => status !== 'CANCELED' && status !== 'INVALIDATED')
         )})::int AS total,
         COUNT(*) FILTER (WHERE ${openStatusSql})::int AS open_count,
         COUNT(*) FILTER (WHERE ${pendingStatusSql})::int AS pending_count,
         COUNT(*) FILTER (WHERE ${closedStatusSql})::int AS closed_count,
         COUNT(*) FILTER (WHERE is_priority = TRUE)::int AS priority_count,
         COUNT(*) FILTER (WHERE ${activeIncidentStatusSql})::int AS active_count,
         COUNT(*) FILTER (WHERE ${activeIncidentStatusSql} AND is_taken = FALSE)::int AS not_taken_count,
         COUNT(*) FILTER (
           WHERE ${activeIncidentStatusSql}
             AND is_priority = TRUE
             AND is_taken = FALSE
         )::int AS urgent_not_taken_count,
         COUNT(*) FILTER (WHERE taken_at IS NOT NULL)::int AS taken_count,
         COUNT(*) FILTER (
           WHERE ${activeIncidentStatusSql}
             AND NOW() - created_at > INTERVAL ${INCIDENT_RECENT_AGE}
         )::int AS open_over_24h_count,
         COUNT(*) FILTER (
           WHERE ${activeIncidentStatusSql}
             AND NOW() - created_at > INTERVAL ${INCIDENT_CRITICAL_AGE}
         )::int AS open_over_7d_count,
         MAX(EXTRACT(EPOCH FROM (NOW() - created_at))) FILTER (
           WHERE ${activeIncidentStatusSql}
         ) AS oldest_active_seconds,
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (taken_at - created_at))
         ) AS median_take_seconds,
         AVG(EXTRACT(EPOCH FROM (taken_at - created_at))) AS avg_take_seconds
       FROM workshop_incidents wi
       ${whereClause}`,
      params
    ),
    pool.query(
      `SELECT wi.state, COUNT(*)::int AS count
       FROM workshop_incidents wi
       ${whereClause}
       GROUP BY wi.state
       ORDER BY count DESC`,
      params
    ),
    pool.query(
      `SELECT wi.line_number, COUNT(*)::int AS count
       FROM workshop_incidents wi
       ${whereClause}
       GROUP BY wi.line_number
       ORDER BY count DESC`,
      params
    ),
    pool.query(
      `SELECT wi.machine_id, COUNT(*)::int AS count
       FROM workshop_incidents wi
       ${whereClause}
       GROUP BY wi.machine_id
       ORDER BY count DESC`,
      params
    ),
    // Durée de clôture : jointe directement sur sa propre cohorte
    // (« clôturés sur la période »), indépendante de la date de création.
    pool.query(
      `SELECT
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (we.created_at - wi.created_at))
         ) AS median_close_seconds,
         AVG(EXTRACT(EPOCH FROM (we.created_at - wi.created_at))) AS avg_close_seconds,
         COUNT(*)::int AS closed_in_window_count
       FROM (
         SELECT incident_id, MIN(created_at) AS created_at
         FROM workshop_incident_events
         WHERE event_type = 'INCIDENT_CLOSED'
         GROUP BY incident_id
       ) we
       JOIN workshop_incidents wi ON wi.id = we.incident_id
       ${closedWhereClause}`,
      closedScopeParams
    ),
    // Créés sur la période, par jour — sans jointure sur les clôtures : pas
    // de produit cartésien, agrégation directe groupée par jour (ANA-06). Le
    // jour métier est tronqué explicitement en Europe/Paris (DR-10) : ne
    // dépend jamais du fuseau de session PostgreSQL ambiant.
    pool.query(
      `SELECT date_trunc('day', wi.created_at AT TIME ZONE 'Europe/Paris')::date::text AS day,
              COUNT(*)::int AS created_count,
              COUNT(*) FILTER (WHERE wi.is_priority = TRUE)::int AS priority_count,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (wi.taken_at - wi.created_at))
              ) FILTER (WHERE wi.taken_at IS NOT NULL) AS median_take_seconds
       FROM workshop_incidents wi
       ${whereClause}
       GROUP BY date_trunc('day', wi.created_at AT TIME ZONE 'Europe/Paris')::date`,
      params
    ),
    // Clôturés sur la période, par jour — même principe, agrégation directe
    // groupée par jour de clôture, jamais de produit cartésien, jour métier
    // explicitement Europe/Paris (DR-10).
    pool.query(
      `SELECT date_trunc('day', we.created_at AT TIME ZONE 'Europe/Paris')::date::text AS day,
              COUNT(*)::int AS closed_count,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY EXTRACT(EPOCH FROM (we.created_at - wi.created_at))
              ) AS median_close_seconds
       FROM (
         SELECT incident_id, MIN(created_at) AS created_at
         FROM workshop_incident_events
         WHERE event_type = 'INCIDENT_CLOSED'
         GROUP BY incident_id
       ) we
       JOIN workshop_incidents wi ON wi.id = we.incident_id
       ${closedWhereClause}
       GROUP BY date_trunc('day', we.created_at AT TIME ZONE 'Europe/Paris')::date`,
      closedScopeParams
    ),
  ]);

  const totals = totalsRows[0] || {};
  const closeStats = closeRows[0] || {};

  const createdByDay = new Map(
    createdTrendRows.map((row) => [
      row.day,
      {
        created: row.created_count,
        priority: row.priority_count,
        medianTake: row.median_take_seconds,
      },
    ])
  );
  const closedByDay = new Map(
    closedTrendRows.map((row) => [
      row.day,
      { closed: row.closed_count, medianClose: row.median_close_seconds },
    ])
  );
  const allDays = Array.from(new Set([...createdByDay.keys(), ...closedByDay.keys()])).sort();
  const trend = allDays.map((day) => {
    const created = createdByDay.get(day);
    const closed = closedByDay.get(day);
    return {
      day,
      created: created?.created ?? 0,
      closed: closed?.closed ?? 0,
      priority: created?.priority ?? 0,
      median_take_seconds: created?.medianTake ? Number(created.medianTake) : null,
      median_close_seconds: closed?.medianClose ? Number(closed.medianClose) : null,
    };
  });

  return {
    total: totals.total ?? 0,
    open: totals.open_count ?? 0,
    pending: totals.pending_count ?? 0,
    // Cohortes DR-09 : « créés sur la période » (wi.created_at dans la
    // fenêtre) et « clôturés sur la période » (événement INCIDENT_CLOSED
    // dans la fenêtre) sont deux populations indépendantes, jamais mélangées.
    // `created` réutilise `total`, qui est déjà filtré sur wi.created_at par
    // whereClause ; `closed` compte désormais les clôtures dans la fenêtre,
    // quelle que soit la date de création de l'incident concerné.
    created: totals.total ?? 0,
    closed: closeStats.closed_in_window_count ?? 0,
    priority: totals.priority_count ?? 0,
    active: totals.active_count ?? 0,
    not_taken: totals.not_taken_count ?? 0,
    urgent_not_taken: totals.urgent_not_taken_count ?? 0,
    taken: totals.taken_count ?? 0,
    open_over_24h: totals.open_over_24h_count ?? 0,
    open_over_7d: totals.open_over_7d_count ?? 0,
    oldest_active_seconds: totals.oldest_active_seconds
      ? Number(totals.oldest_active_seconds)
      : null,
    median_take_seconds: totals.median_take_seconds ? Number(totals.median_take_seconds) : null,
    avg_take_seconds: totals.avg_take_seconds ? Number(totals.avg_take_seconds) : null,
    median_close_seconds: closeStats.median_close_seconds
      ? Number(closeStats.median_close_seconds)
      : null,
    avg_close_seconds: closeStats.avg_close_seconds ? Number(closeStats.avg_close_seconds) : null,
    by_state: stateRows.map((row) => ({ state: row.state, count: row.count })),
    by_line: lineRows.map((row) => ({ line_number: row.line_number, count: row.count })),
    by_machine: machineRows.map((row) => ({ machine_id: row.machine_id, count: row.count })),
    trend,
  };
}
