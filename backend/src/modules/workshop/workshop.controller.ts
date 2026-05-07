import { Request, Response } from 'express';
import { ZodError } from 'zod';
import pool from '../../db/pool';
import { sendError } from '../../utils/errors';
import { createIncidentSchema, updateIncidentSchema } from './workshop.validation';

type StoredMachine =
  | {
      machineId: string;
      brand: string;
      hasDoubleRobot: false;
      robotNumber: string;
      robotHeads: number;
    }
  | {
      machineId: string;
      brand: string;
      hasDoubleRobot: true;
      leftRobotNumber: string;
      leftRobotHeads: number;
      rightRobotNumber: string;
      rightRobotHeads: number;
    };

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => e.message).join(' ');
}

function getRobotOptions(machine: StoredMachine): { label: string; heads: number }[] {
  if (machine.hasDoubleRobot) {
    return [
      { label: `Gauche ${machine.leftRobotNumber}`, heads: machine.leftRobotHeads },
      { label: `Droite ${machine.rightRobotNumber}`, heads: machine.rightRobotHeads },
    ];
  }

  return [{ label: machine.robotNumber, heads: machine.robotHeads }];
}

async function logIncidentEvent(
  incidentId: number,
  actorUserId: number | null,
  eventType: string,
  payload?: Record<string, unknown>
): Promise<void> {
  await pool.query(
    `INSERT INTO workshop_incident_events (incident_id, actor_user_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [incidentId, actorUserId, eventType, payload ? JSON.stringify(payload) : null]
  );
}

export async function listWorkshopLines(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, line_number, machine_sequence AS machines, is_active, created_at, updated_at
       FROM production_lines
       WHERE is_deleted = FALSE AND is_active = TRUE
       ORDER BY line_number ASC`
    );

    res.json(rows);
  } catch (err) {
    console.error('listWorkshopLines error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listIncidents(req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT wi.id, wi.shift, wi.line_id, wi.line_number, wi.machine_id, wi.machine_brand,
              wi.robot_label, wi.head_number, wi.state, wi.comment, wi.current_product,
              wi.is_taken, wi.is_priority, wi.status, wi.diagnostic, wi.intervention_note,
            wi.responsible_comment, wi.edit_request, wi.delete_request, wi.delete_request_reason,
            wi.taken_by_user_id, wi.taken_at, wi.display_order, wi.created_at, wi.updated_at,
            su.first_name, su.last_name, su.badge_number, su.role,
            tu.first_name AS taken_by_first_name,
            tu.last_name AS taken_by_last_name,
            tu.badge_number AS taken_by_badge_number,
            tu.role AS taken_by_role
       FROM workshop_incidents wi
       JOIN sentinel_users su ON su.id = wi.user_id
       LEFT JOIN sentinel_users tu ON tu.id = wi.taken_by_user_id
       ORDER BY wi.display_order DESC, wi.created_at DESC`
    );

    res.json(rows);
  } catch (err) {
    console.error('listIncidents error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function listIncidentEvents(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `SELECT we.id, we.event_type, we.payload, we.created_at,
              su.first_name, su.last_name, su.badge_number, su.role
       FROM workshop_incident_events we
       LEFT JOIN sentinel_users su ON su.id = we.actor_user_id
       WHERE we.incident_id = $1
       ORDER BY we.created_at DESC`,
      [id]
    );

    res.json(rows);
  } catch (err) {
    console.error('listIncidentEvents error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getIncidentMetrics(req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
         COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed_count,
         COUNT(*) FILTER (WHERE status != 'CLOSED' AND status != 'PENDING'
           AND NOW() - created_at > INTERVAL '7 days')::int AS open_over_7d,
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (taken_at - created_at))
         ) AS median_take_seconds
       FROM workshop_incidents`
    );

    const metrics = rows[0];
    res.json({
      total: metrics.total,
      open: metrics.open_count,
      pending: metrics.pending_count,
      closed: metrics.closed_count,
      open_over_7d: metrics.open_over_7d,
      median_take_seconds: metrics.median_take_seconds ? Number(metrics.median_take_seconds) : null,
    });
  } catch (err) {
    console.error('getIncidentMetrics error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getWorkshopAnalytics(req: Request, res: Response): Promise<void> {
  try {
    const { start, end, lineId, machineId } = req.query;
    const filters: string[] = [];
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
      const parsedLine = parseInt(String(lineId), 10);
      if (!isNaN(parsedLine)) {
        params.push(parsedLine);
        filters.push(`wi.line_id = $${params.length}`);
      }
    }
    if (machineId) {
      params.push(String(machineId));
      filters.push(`wi.machine_id = $${params.length}`);
    }

    const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

    const { rows: totalsRows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
         COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'CLOSED')::int AS closed_count,
         COUNT(*) FILTER (WHERE is_priority = TRUE)::int AS priority_count,
         percentile_cont(0.5) WITHIN GROUP (
           ORDER BY EXTRACT(EPOCH FROM (taken_at - created_at))
         ) AS median_take_seconds,
         AVG(EXTRACT(EPOCH FROM (taken_at - created_at))) AS avg_take_seconds
       FROM workshop_incidents wi
       ${whereClause}`,
      params
    );

    const { rows: stateRows } = await pool.query(
      `SELECT wi.state, COUNT(*)::int AS count
       FROM workshop_incidents wi
       ${whereClause}
       GROUP BY wi.state
       ORDER BY count DESC`,
      params
    );

    const { rows: lineRows } = await pool.query(
      `SELECT wi.line_number, COUNT(*)::int AS count
       FROM workshop_incidents wi
       ${whereClause}
       GROUP BY wi.line_number
       ORDER BY count DESC`,
      params
    );

    const { rows: machineRows } = await pool.query(
      `SELECT wi.machine_id, COUNT(*)::int AS count
       FROM workshop_incidents wi
       ${whereClause}
       GROUP BY wi.machine_id
       ORDER BY count DESC`,
      params
    );

    const { rows: closeRows } = await pool.query(
      `WITH filtered_incidents AS (
         SELECT wi.id, wi.created_at
         FROM workshop_incidents wi
         ${whereClause}
       ),
       closed_events AS (
         SELECT we.incident_id, MIN(we.created_at) AS closed_at
         FROM workshop_incident_events we
         WHERE we.event_type = 'STATUS_CHANGED'
           AND (we.payload->>'to') = 'CLOSED'
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
    );

    const totals = totalsRows[0] || {};
    const closeStats = closeRows[0] || {};

    res.json({
      total: totals.total ?? 0,
      open: totals.open_count ?? 0,
      pending: totals.pending_count ?? 0,
      closed: totals.closed_count ?? 0,
      priority: totals.priority_count ?? 0,
      median_take_seconds: totals.median_take_seconds ? Number(totals.median_take_seconds) : null,
      avg_take_seconds: totals.avg_take_seconds ? Number(totals.avg_take_seconds) : null,
      median_close_seconds: closeStats.median_close_seconds ? Number(closeStats.median_close_seconds) : null,
      avg_close_seconds: closeStats.avg_close_seconds ? Number(closeStats.avg_close_seconds) : null,
      by_state: stateRows.map((row) => ({ state: row.state, count: row.count })),
      by_line: lineRows.map((row) => ({ line_number: row.line_number, count: row.count })),
      by_machine: machineRows.map((row) => ({ machine_id: row.machine_id, count: row.count })),
    });
  } catch (err) {
    console.error('getWorkshopAnalytics error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function createIncident(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const data = parsed.data;
    const { rows: lineRows } = await pool.query(
      `SELECT id, line_number, machine_sequence AS machines
       FROM production_lines
       WHERE id = $1 AND is_deleted = FALSE AND is_active = TRUE`,
      [data.lineId]
    );

    if (lineRows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Ligne introuvable ou inactive.');
      return;
    }

    const line = lineRows[0] as { id: number; line_number: string; machines: StoredMachine[] };
    const machine = line.machines.find((item) => item.machineId === data.machineId);
    if (!machine) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Machine invalide pour cette ligne.');
      return;
    }

    const robot = getRobotOptions(machine).find((item) => item.label === data.robotLabel);
    if (!robot) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Robot invalide pour cette machine.');
      return;
    }
    if (data.headNumber < 1 || data.headNumber > robot.heads) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Tête invalide pour ce robot.');
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO workshop_incidents (
        user_id, shift, line_id, line_number, machine_id, machine_brand,
        robot_label, head_number, state, comment, current_product, display_order
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, shift, line_id, line_number, machine_id, machine_brand,
                 robot_label, head_number, state, comment, current_product,
                 is_taken, is_priority, status, diagnostic, intervention_note,
                 responsible_comment, edit_request, delete_request, delete_request_reason,
                 taken_by_user_id, taken_at, display_order, created_at, updated_at`,
      [
        req.workshopUser!.userId,
        data.shift,
        line.id,
        line.line_number,
        machine.machineId,
        machine.brand,
        robot.label,
        data.headNumber,
        data.state,
        data.comment || null,
        data.currentProduct || null,
        Date.now(),
      ]
    );
    const incidentId = rows[0].id as number;
    await logIncidentEvent(incidentId, req.workshopUser!.userId, 'INCIDENT_CREATED', {
      state: data.state,
    });
    const payload = await fetchIncidentWithUsers(incidentId);
    res.status(201).json(payload);
  } catch (err) {
    console.error('createIncident error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

async function validateIncidentSelection(data: {
  lineId?: number;
  machineId?: string;
  robotLabel?: string;
  headNumber?: number;
}): Promise<{ lineNumber: string; machineBrand: string } | null> {
  if (!data.lineId || !data.machineId || !data.robotLabel || !data.headNumber) return null;

  const { rows: lineRows } = await pool.query(
    `SELECT id, line_number, machine_sequence AS machines
     FROM production_lines
     WHERE id = $1 AND is_deleted = FALSE AND is_active = TRUE`,
    [data.lineId]
  );
  if (lineRows.length === 0) return null;

  const line = lineRows[0] as { line_number: string; machines: StoredMachine[] };
  const machine = line.machines.find((item) => item.machineId === data.machineId);
  if (!machine) return null;

  const robot = getRobotOptions(machine).find((item) => item.label === data.robotLabel);
  if (!robot || data.headNumber < 1 || data.headNumber > robot.heads) return null;

  return { lineNumber: line.line_number, machineBrand: machine.brand };
}

async function fetchIncidentWithUsers(incidentId: number) {
  const { rows } = await pool.query(
    `SELECT wi.id, wi.shift, wi.line_id, wi.line_number, wi.machine_id, wi.machine_brand,
            wi.robot_label, wi.head_number, wi.state, wi.comment, wi.current_product,
            wi.is_taken, wi.is_priority, wi.status, wi.diagnostic, wi.intervention_note,
            wi.responsible_comment, wi.edit_request, wi.delete_request, wi.delete_request_reason,
            wi.taken_by_user_id, wi.taken_at, wi.created_at, wi.updated_at,
            su.first_name, su.last_name, su.badge_number, su.role,
            tu.first_name AS taken_by_first_name,
            tu.last_name AS taken_by_last_name,
            tu.badge_number AS taken_by_badge_number,
            tu.role AS taken_by_role
     FROM workshop_incidents wi
     JOIN sentinel_users su ON su.id = wi.user_id
     LEFT JOIN sentinel_users tu ON tu.id = wi.taken_by_user_id
     WHERE wi.id = $1`,
    [incidentId]
  );

  return rows[0];
}

export async function updateIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const parsed = updateIncidentSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const currentRows = await pool.query(
      'SELECT * FROM workshop_incidents WHERE id = $1',
      [id]
    );
    if (currentRows.rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Incident introuvable.');
      return;
    }

    const current = currentRows.rows[0];
    const updates = parsed.data;
    const role = req.workshopUser!.role;

    if (updates.applyEditRequest || updates.rejectEditRequest || updates.rejectDeleteRequest) {
      if (role === 'OPERATOR') {
        sendError(res, 403, 'FORBIDDEN', 'Action non autorisée pour ce rôle.');
        return;
      }
    }

    if (role === 'MAINTENANCE' && current.is_taken && (updates.applyEditRequest || updates.rejectEditRequest)) {
      sendError(res, 403, 'FORBIDDEN', 'Modification interdite apres prise en charge.');
      return;
    }

    if (updates.rejectDeleteRequest && role !== 'RESPONSABLE') {
      sendError(res, 403, 'FORBIDDEN', 'Seul le responsable peut refuser une suppression.');
      return;
    }

    if (updates.deleteRequest) {
      if (role === 'RESPONSABLE') {
        sendError(res, 403, 'FORBIDDEN', 'Le responsable peut supprimer directement.');
        return;
      }
      if (!updates.deleteRequestReason?.trim()) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Motif obligatoire pour la suppression.');
        return;
      }
      const { rows } = await pool.query(
        `UPDATE workshop_incidents
         SET delete_request = TRUE, delete_request_reason = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING id, shift, line_id, line_number, machine_id, machine_brand, robot_label,
                   head_number, state, comment, current_product, is_taken, is_priority,
                   status, diagnostic, intervention_note, responsible_comment, edit_request,
                   delete_request, delete_request_reason, created_at, updated_at`,
        [updates.deleteRequestReason.trim(), id]
      );
      await logIncidentEvent(id, req.workshopUser!.userId, 'DELETE_REQUESTED', {
        reason: updates.deleteRequestReason.trim(),
      });
      const payload = await fetchIncidentWithUsers(rows[0].id as number);
      res.json(payload);
      return;
    }

    if (role === 'OPERATOR') {
      if (updates.requestOnly) {
        const { requestOnly, deleteRequest, deleteRequestReason, ...editPayload } = updates;
        if (Object.keys(editPayload).length === 0) {
          sendError(res, 400, 'VALIDATION_ERROR', 'Aucune modification demandée.');
          return;
        }
        const { rows } = await pool.query(
          `UPDATE workshop_incidents
           SET edit_request = $1, updated_at = NOW()
           WHERE id = $2
           RETURNING id, shift, line_id, line_number, machine_id, machine_brand, robot_label,
                     head_number, state, comment, current_product, is_taken, is_priority,
                     status, diagnostic, intervention_note, responsible_comment, edit_request,
                     delete_request, delete_request_reason, created_at, updated_at`,
          [JSON.stringify(editPayload), id]
        );
        await logIncidentEvent(id, req.workshopUser!.userId, 'EDIT_REQUESTED', {
          changes: editPayload,
        });
        const payload = await fetchIncidentWithUsers(rows[0].id as number);
        res.json(payload);
        return;
      }
      sendError(res, 403, 'FORBIDDEN', 'Modification directe non autorisée pour ce rôle.');
      return;
    }

    if (updates.rejectEditRequest) {
      const { rows } = await pool.query(
        `UPDATE workshop_incidents
         SET edit_request = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING id, shift, line_id, line_number, machine_id, machine_brand, robot_label,
                   head_number, state, comment, current_product, is_taken, is_priority,
                   status, diagnostic, intervention_note, responsible_comment, edit_request,
                   delete_request, delete_request_reason, created_at, updated_at`,
        [id]
      );
      await logIncidentEvent(id, req.workshopUser!.userId, 'EDIT_REJECTED');
      const payload = await fetchIncidentWithUsers(rows[0].id as number);
      res.json(payload);
      return;
    }

    if (updates.rejectDeleteRequest) {
      const { rows } = await pool.query(
        `UPDATE workshop_incidents
         SET delete_request = FALSE, delete_request_reason = NULL, updated_at = NOW()
         WHERE id = $1
         RETURNING id, shift, line_id, line_number, machine_id, machine_brand, robot_label,
                   head_number, state, comment, current_product, is_taken, is_priority,
                   status, diagnostic, intervention_note, responsible_comment, edit_request,
                   delete_request, delete_request_reason, created_at, updated_at`,
        [id]
      );
      await logIncidentEvent(id, req.workshopUser!.userId, 'DELETE_REQUEST_REJECTED');
      const payload = await fetchIncidentWithUsers(rows[0].id as number);
      res.json(payload);
      return;
    }

    if (updates.applyEditRequest) {
      if (!current.edit_request) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Aucune demande de modification à appliquer.');
        return;
      }
      const requested = current.edit_request as Record<string, unknown>;
      const requestedShift = (requested.shift as string | undefined) ?? current.shift;
      const requestedLineId = (requested.lineId as number | undefined) ?? current.line_id;
      const requestedMachineId = (requested.machineId as string | undefined) ?? current.machine_id;
      const requestedRobotLabel = (requested.robotLabel as string | undefined) ?? current.robot_label;
      const requestedHeadNumber = (requested.headNumber as number | undefined) ?? current.head_number;
      const selection = await validateIncidentSelection({
        lineId: requestedLineId,
        machineId: requestedMachineId,
        robotLabel: requestedRobotLabel,
        headNumber: requestedHeadNumber,
      });
      if (!selection) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Sélection ligne/machine/robot/tête invalide.');
        return;
      }

      const { rows } = await pool.query(
        `UPDATE workshop_incidents
         SET shift = $1, line_id = $2, line_number = $3, machine_id = $4, machine_brand = $5,
             robot_label = $6, head_number = $7, state = $8, comment = $9, current_product = $10,
             edit_request = NULL, updated_at = NOW()
         WHERE id = $11
         RETURNING id, shift, line_id, line_number, machine_id, machine_brand, robot_label,
                   head_number, state, comment, current_product, is_taken, is_priority,
                   status, diagnostic, intervention_note, responsible_comment, edit_request,
                   delete_request, delete_request_reason, created_at, updated_at`,
        [
          requestedShift,
          requestedLineId,
          selection.lineNumber,
          requestedMachineId,
          selection.machineBrand,
          requestedRobotLabel,
          requestedHeadNumber,
          (requested.state as string | undefined) ?? current.state,
          (requested.comment as string | null | undefined) ?? current.comment,
          (requested.currentProduct as string | null | undefined) ?? current.current_product,
          id,
        ]
      );
      await logIncidentEvent(id, req.workshopUser!.userId, 'EDIT_APPLIED');
      const payload = await fetchIncidentWithUsers(rows[0].id as number);
      res.json(payload);
      return;
    }

    if (updates.isTaken !== undefined && role !== 'MAINTENANCE') {
      sendError(res, 403, 'FORBIDDEN', 'Seule la maintenance peut prendre en charge.');
      return;
    }
    if (updates.isPriority !== undefined && role !== 'RESPONSABLE') {
      sendError(res, 403, 'FORBIDDEN', 'Seul le responsable peut modifier la priorité.');
      return;
    }
    if (updates.displayOrder !== undefined && role !== 'RESPONSABLE') {
      sendError(res, 403, 'FORBIDDEN', 'Seul le responsable peut reordonner.');
      return;
    }
    if ((updates.status === 'PENDING' || updates.status === 'CLOSED') && role !== 'MAINTENANCE') {
      sendError(res, 403, 'FORBIDDEN', 'Seule la maintenance peut mettre en attente ou clôturer.');
      return;
    }
    if (updates.status === 'PENDING' && !updates.diagnostic && !current.diagnostic) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Diagnostic obligatoire avant mise en attente.');
      return;
    }
    if (updates.status === 'CLOSED' && current.status === 'PENDING') {
      sendError(res, 400, 'VALIDATION_ERROR', 'Impossible de clôturer un incident en attente.');
      return;
    }
    if (updates.status === 'CLOSED' && !updates.interventionNote && !current.intervention_note) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Documentation intervention obligatoire avant clôture.');
      return;
    }

    const editingFieldsTouched =
      updates.shift !== undefined ||
      updates.lineId !== undefined ||
      updates.machineId !== undefined ||
      updates.robotLabel !== undefined ||
      updates.headNumber !== undefined ||
      updates.state !== undefined ||
      updates.comment !== undefined ||
      updates.currentProduct !== undefined;

    if (role === 'MAINTENANCE' && current.is_taken && editingFieldsTouched) {
      sendError(res, 403, 'FORBIDDEN', 'Modification interdite apres prise en charge.');
      return;
    }

    const tookOwnership = updates.isTaken === true && !current.is_taken;
    const nextTakenByUserId = tookOwnership ? req.workshopUser!.userId : current.taken_by_user_id;
    const nextTakenAt = tookOwnership ? new Date() : current.taken_at;
    const statusChanged = updates.status !== undefined && updates.status !== current.status;
    const priorityChanged = updates.isPriority !== undefined && updates.isPriority !== current.is_priority;
    const orderChanged = updates.displayOrder !== undefined && updates.displayOrder !== current.display_order;
    const responsibleChanged =
      role === 'RESPONSABLE' && updates.responsibleComment !== undefined &&
      updates.responsibleComment !== current.responsible_comment;

    const lineId = updates.lineId ?? current.line_id;
    const machineId = updates.machineId ?? current.machine_id;
    const robotLabel = updates.robotLabel ?? current.robot_label;
    const headNumber = updates.headNumber ?? current.head_number;
    const selection = await validateIncidentSelection({ lineId, machineId, robotLabel, headNumber });
    if (!selection) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Sélection ligne/machine/robot/tête invalide.');
      return;
    }

    const { rows } = await pool.query(
      `UPDATE workshop_incidents
       SET shift = $1, line_id = $2, line_number = $3, machine_id = $4, machine_brand = $5,
           robot_label = $6, head_number = $7, state = $8, comment = $9, current_product = $10,
           is_taken = $11, is_priority = $12, status = $13, diagnostic = $14,
           intervention_note = $15, responsible_comment = $16,
           taken_by_user_id = $17, taken_at = $18, display_order = $19, updated_at = NOW()
       WHERE id = $20
       RETURNING id, shift, line_id, line_number, machine_id, machine_brand, robot_label,
                 head_number, state, comment, current_product, is_taken, is_priority,
                 status, diagnostic, intervention_note, responsible_comment, edit_request,
                 delete_request, delete_request_reason, taken_by_user_id, taken_at, display_order,
                 created_at, updated_at`,
      [
        updates.shift ?? current.shift,
        lineId,
        selection.lineNumber,
        machineId,
        selection.machineBrand,
        robotLabel,
        headNumber,
        updates.state ?? current.state,
        updates.comment ?? current.comment,
        updates.currentProduct ?? current.current_product,
        updates.isTaken ?? current.is_taken,
        updates.isPriority ?? current.is_priority,
        updates.status ?? current.status,
        updates.diagnostic ?? current.diagnostic,
        updates.interventionNote ?? current.intervention_note,
        role === 'RESPONSABLE' ? (updates.responsibleComment ?? current.responsible_comment) : current.responsible_comment,
        nextTakenByUserId,
        nextTakenAt,
        updates.displayOrder ?? current.display_order,
        id,
      ]
    );
    if (tookOwnership) {
      await logIncidentEvent(id, req.workshopUser!.userId, 'INCIDENT_TAKEN');
    }
    if (statusChanged) {
      await logIncidentEvent(id, req.workshopUser!.userId, 'STATUS_CHANGED', {
        from: current.status,
        to: updates.status,
      });
    }
    if (priorityChanged) {
      await logIncidentEvent(id, req.workshopUser!.userId, 'PRIORITY_CHANGED', {
        value: updates.isPriority,
      });
    }
    if (orderChanged) {
      await logIncidentEvent(id, req.workshopUser!.userId, 'ORDER_CHANGED', {
        value: updates.displayOrder,
      });
    }
    if (responsibleChanged) {
      await logIncidentEvent(id, req.workshopUser!.userId, 'RESPONSIBLE_COMMENT_UPDATED');
    }
    if (editingFieldsTouched) {
      await logIncidentEvent(id, req.workshopUser!.userId, 'INCIDENT_UPDATED');
    }
    const payload = await fetchIncidentWithUsers(rows[0].id as number);
    res.json(payload);
  } catch (err) {
    console.error('updateIncident error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function deleteIncident(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    if (req.workshopUser!.role !== 'RESPONSABLE' && req.workshopUser!.role !== 'MAINTENANCE') {
      sendError(res, 403, 'FORBIDDEN', 'Seul le responsable ou la maintenance peut supprimer.');
      return;
    }

    if (req.workshopUser!.role === 'MAINTENANCE') {
      const { rows } = await pool.query(
        'SELECT is_taken FROM workshop_incidents WHERE id = $1',
        [id]
      );
      if (rows.length === 0) {
        sendError(res, 404, 'NOT_FOUND', 'Incident introuvable.');
        return;
      }
      if (rows[0].is_taken) {
        sendError(res, 403, 'FORBIDDEN', 'Suppression interdite apres prise en charge.');
        return;
      }
    }

    const { rowCount } = await pool.query(
      'DELETE FROM workshop_incidents WHERE id = $1',
      [id]
    );
    if (rowCount === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Incident introuvable.');
      return;
    }

    res.json({ message: 'Incident supprimé.' });
  } catch (err) {
    console.error('deleteIncident error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
