import { Request, Response } from 'express';
import pool from '../../db/pool';
import { sendError } from '../../utils/errors';

export async function getReferenceDashboard(_req: Request, res: Response): Promise<void> {
  try {
    const [userStats, lineStats, recentAccountEvents, recentLineEvents] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE is_deleted = FALSE)::int AS users_total,
           COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = TRUE)::int AS users_active,
           COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = FALSE)::int AS users_inactive,
           COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = TRUE AND password_hash IS NULL)::int AS users_without_password
         FROM sentinel_users`
      ),
      pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE is_deleted = FALSE)::int AS lines_total,
           COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = TRUE)::int AS lines_active,
           COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = FALSE)::int AS lines_inactive,
           COALESCE(SUM(jsonb_array_length(machine_sequence)) FILTER (WHERE is_deleted = FALSE), 0)::int AS machines_total,
           COUNT(*) FILTER (WHERE is_deleted = FALSE AND is_active = TRUE AND jsonb_array_length(machine_sequence) = 0)::int AS active_lines_without_machines
         FROM production_lines`
      ),
      pool.query(
        `SELECT ae.id, 'account' AS scope, ae.event_type, ae.changes, ae.created_at,
                su.first_name, su.last_name, su.badge_number, NULL::varchar AS line_number
         FROM account_audit_events ae
         LEFT JOIN sentinel_users su ON su.id = ae.target_user_id
         ORDER BY ae.created_at DESC
         LIMIT 5`
      ),
      pool.query(
        `SELECT le.id, 'line' AS scope, le.event_type, le.changes, le.created_at,
                NULL::varchar AS first_name, NULL::varchar AS last_name, NULL::varchar AS badge_number,
                pl.line_number
         FROM line_audit_events le
         LEFT JOIN production_lines pl ON pl.id = le.target_line_id
         ORDER BY le.created_at DESC
         LIMIT 5`
      ),
    ]);

    const recentEvents = [...recentAccountEvents.rows, ...recentLineEvents.rows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);

    res.json({
      ...userStats.rows[0],
      ...lineStats.rows[0],
      recent_events: recentEvents,
    });
  } catch (err) {
    console.error('getReferenceDashboard error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getReferenceQuality(_req: Request, res: Response): Promise<void> {
  try {
    const [usersWithoutPassword, inactiveUsers, inactiveLines, lineIssues] = await Promise.all([
      pool.query(
        `SELECT id, first_name, last_name, badge_number, role
         FROM sentinel_users
         WHERE is_deleted = FALSE AND is_active = TRUE AND password_hash IS NULL
         ORDER BY last_name ASC, first_name ASC`
      ),
      pool.query(
        `SELECT id, first_name, last_name, badge_number, role
         FROM sentinel_users
         WHERE is_deleted = FALSE AND is_active = FALSE
         ORDER BY updated_at DESC`
      ),
      pool.query(
        `SELECT id, line_number, jsonb_array_length(machine_sequence)::int AS machine_count
         FROM production_lines
         WHERE is_deleted = FALSE AND is_active = FALSE
         ORDER BY updated_at DESC`
      ),
      pool.query(
        `SELECT id, line_number, machine_sequence AS machines, is_active
         FROM production_lines
         WHERE is_deleted = FALSE
         ORDER BY line_number ASC`
      ),
    ]);

    const malformedMachines: Array<{ line_id: number; line_number: string; machine_id: string; issue: string }> = [];
    const machineOwners = new Map<string, string[]>();

    for (const line of lineIssues.rows) {
      const machines = Array.isArray(line.machines) ? line.machines : [];
      if (line.is_active && machines.length === 0) {
        malformedMachines.push({
          line_id: line.id,
          line_number: line.line_number,
          machine_id: '-',
          issue: 'Ligne active sans machine',
        });
      }
      for (const machine of machines) {
        const id = String(machine.machineId || '').trim();
        if (!id || !String(machine.brand || '').trim()) {
          malformedMachines.push({
            line_id: line.id,
            line_number: line.line_number,
            machine_id: id || '-',
            issue: 'Machine incomplète',
          });
        }
        if (id) {
          const key = id.toLowerCase();
          machineOwners.set(key, [...(machineOwners.get(key) || []), line.line_number]);
        }
      }
    }

    const duplicateMachines = Array.from(machineOwners.entries())
      .filter(([, owners]) => owners.length > 1)
      .map(([machine_id, line_numbers]) => ({ machine_id, line_numbers }));

    res.json({
      users_without_password: usersWithoutPassword.rows,
      inactive_users: inactiveUsers.rows,
      inactive_lines: inactiveLines.rows,
      malformed_machines: malformedMachines,
      duplicate_machines: duplicateMachines,
    });
  } catch (err) {
    console.error('getReferenceQuality error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listReferenceAudit(req: Request, res: Response): Promise<void> {
  try {
    const scope = String(req.query.scope || 'all');
    const limit = Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 250);
    const accountSql = `
      SELECT ae.id, 'account' AS scope, ae.event_type, ae.changes, ae.created_at,
             su.first_name, su.last_name, su.badge_number, NULL::varchar AS line_number
      FROM account_audit_events ae
      LEFT JOIN sentinel_users su ON su.id = ae.target_user_id`;
    const lineSql = `
      SELECT le.id, 'line' AS scope, le.event_type, le.changes, le.created_at,
             NULL::varchar AS first_name, NULL::varchar AS last_name, NULL::varchar AS badge_number,
             pl.line_number
      FROM line_audit_events le
      LEFT JOIN production_lines pl ON pl.id = le.target_line_id`;

    const sql = scope === 'account'
      ? `${accountSql} ORDER BY created_at DESC LIMIT $1`
      : scope === 'line'
        ? `${lineSql} ORDER BY created_at DESC LIMIT $1`
        : `SELECT * FROM (${accountSql} UNION ALL ${lineSql}) events ORDER BY created_at DESC LIMIT $1`;

    const { rows } = await pool.query(sql, [limit]);
    res.json(rows);
  } catch (err) {
    console.error('listReferenceAudit error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
