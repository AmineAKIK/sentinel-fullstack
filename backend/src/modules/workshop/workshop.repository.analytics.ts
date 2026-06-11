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

  const [
    { rows: totalsRows },
    { rows: stateRows },
    { rows: lineRows },
    { rows: machineRows },
    { rows: closeRows },
    { rows: trendRows },
  ] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE ${statusInSql('status', INCIDENT_STATUSES.filter((status) => status !== 'CANCELED' && status !== 'INVALIDATED'))})::int AS total,
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
    pool.query(
      `WITH filtered_incidents AS (
         SELECT wi.id, wi.created_at
         FROM workshop_incidents wi
         ${whereClause}
       ),
       closed_events AS (
         SELECT we.incident_id, MIN(we.created_at) AS closed_at
         FROM workshop_incident_events we
         WHERE we.event_type = 'INCIDENT_CLOSED'
         GROUP BY we.incident_id
       )
       SELECT
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (ce.closed_at - fi.created_at))
         ) AS median_close_seconds,
         AVG(EXTRACT(EPOCH FROM (ce.closed_at - fi.created_at))) AS avg_close_seconds
       FROM filtered_incidents fi
       JOIN closed_events ce ON ce.incident_id = fi.id`,
      params
    ),
    pool.query(
    `WITH filtered_incidents AS (
       SELECT wi.id, wi.created_at, wi.taken_at, wi.is_priority
       FROM workshop_incidents wi
       ${whereClause}
     ),
     closed_events AS (
       SELECT we.incident_id, MIN(we.created_at) AS closed_at
       FROM workshop_incident_events we
       WHERE we.event_type = 'INCIDENT_CLOSED'
       GROUP BY we.incident_id
     ),
     day_keys AS (
       SELECT date_trunc('day', created_at)::date AS day FROM filtered_incidents
       UNION
       SELECT date_trunc('day', closed_at)::date AS day FROM closed_events ce
       JOIN filtered_incidents fi ON fi.id = ce.incident_id
     )
     SELECT
       dk.day::text AS day,
       COUNT(fi.id) FILTER (WHERE date_trunc('day', fi.created_at)::date = dk.day)::int AS created_count,
       COUNT(ce.incident_id) FILTER (WHERE date_trunc('day', ce.closed_at)::date = dk.day)::int AS closed_count,
       COUNT(fi.id) FILTER (
         WHERE date_trunc('day', fi.created_at)::date = dk.day
           AND fi.is_priority = TRUE
       )::int AS priority_count,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (fi.taken_at - fi.created_at))
       ) FILTER (
         WHERE date_trunc('day', fi.created_at)::date = dk.day
           AND fi.taken_at IS NOT NULL
       ) AS median_take_seconds,
       percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (ce.closed_at - fi.created_at))
       ) FILTER (
         WHERE date_trunc('day', ce.closed_at)::date = dk.day
       ) AS median_close_seconds
       FROM day_keys dk
       LEFT JOIN filtered_incidents fi ON TRUE
       LEFT JOIN closed_events ce ON ce.incident_id = fi.id
       GROUP BY dk.day
       ORDER BY dk.day ASC`,
      params
    ),
  ]);

  const totals = totalsRows[0] || {};
  const closeStats = closeRows[0] || {};

  return {
    total: totals.total ?? 0,
    open: totals.open_count ?? 0,
    pending: totals.pending_count ?? 0,
    closed: totals.closed_count ?? 0,
    priority: totals.priority_count ?? 0,
    active: totals.active_count ?? 0,
    not_taken: totals.not_taken_count ?? 0,
    urgent_not_taken: totals.urgent_not_taken_count ?? 0,
    taken: totals.taken_count ?? 0,
    open_over_24h: totals.open_over_24h_count ?? 0,
    open_over_7d: totals.open_over_7d_count ?? 0,
    oldest_active_seconds: totals.oldest_active_seconds ? Number(totals.oldest_active_seconds) : null,
    median_take_seconds: totals.median_take_seconds ? Number(totals.median_take_seconds) : null,
    avg_take_seconds: totals.avg_take_seconds ? Number(totals.avg_take_seconds) : null,
    median_close_seconds: closeStats.median_close_seconds ? Number(closeStats.median_close_seconds) : null,
    avg_close_seconds: closeStats.avg_close_seconds ? Number(closeStats.avg_close_seconds) : null,
    by_state: stateRows.map((row) => ({ state: row.state, count: row.count })),
    by_line: lineRows.map((row) => ({ line_number: row.line_number, count: row.count })),
    by_machine: machineRows.map((row) => ({ machine_id: row.machine_id, count: row.count })),
    trend: trendRows.map((row) => ({
      day: row.day,
      created: row.created_count,
      closed: row.closed_count,
      priority: row.priority_count,
      median_take_seconds: row.median_take_seconds ? Number(row.median_take_seconds) : null,
      median_close_seconds: row.median_close_seconds ? Number(row.median_close_seconds) : null,
    })),
  };
}
