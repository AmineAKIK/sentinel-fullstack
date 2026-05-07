import { Request, Response } from 'express';
import { ZodError } from 'zod';
import pool from '../../db/pool';
import { sendError } from '../../utils/errors';
import { createLineSchema, updateLineSchema } from './lines.validation';

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => e.message).join(' ');
}

async function createLineAuditEvent(
  targetLineId: number,
  adminId: number,
  eventType: string,
  changes: Record<string, unknown> | null
): Promise<void> {
  await pool.query(
    `INSERT INTO line_audit_events (target_line_id, admin_id, event_type, changes)
     VALUES ($1, $2, $3, $4)`,
    [targetLineId, adminId, eventType, changes ? JSON.stringify(changes) : null]
  );
}

function machineSignature(machines: unknown): string {
  return JSON.stringify(machines);
}

function machineOrder(machines: Array<{ machineId: string }>): string[] {
  return machines.map((machine) => machine.machineId);
}

function getLineEventType(current: {
  line_number: string;
  is_active: boolean;
  machine_sequence: Array<{ machineId: string }>;
}, updates: {
  lineNumber?: string;
  isActive?: boolean;
  machines?: Array<{ machineId: string }>;
}): string {
  const hasLineSummaryChange =
    (updates.lineNumber !== undefined && updates.lineNumber !== current.line_number) ||
    (updates.isActive !== undefined && updates.isActive !== current.is_active);

  if (!updates.machines) return hasLineSummaryChange ? 'LINE_SUMMARY_UPDATED' : 'LINE_UPDATED';

  const beforeOrder = machineOrder(current.machine_sequence).join('|');
  const afterOrder = machineOrder(updates.machines).join('|');
  const sameMachines = machineSignature(current.machine_sequence) === machineSignature(updates.machines);

  if (!sameMachines && beforeOrder === afterOrder && !hasLineSummaryChange) {
    return 'LINE_MACHINE_UPDATED';
  }
  if (!sameMachines && beforeOrder !== afterOrder && !hasLineSummaryChange) {
    return 'LINE_PLAN_UPDATED';
  }
  return 'LINE_UPDATED';
}

async function findMachineConflicts(machineIds: string[], excludeLineId?: number): Promise<string[]> {
  if (machineIds.length === 0) return [];
  const normalized = machineIds.map((id) => id.trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0) return [];

  const params: unknown[] = [normalized];
  const excludeClause = excludeLineId ? 'AND pl.id != $2' : '';
  if (excludeLineId) params.push(excludeLineId);

  const { rows } = await pool.query(
    `SELECT DISTINCT elem->>'machineId' AS machine_id
     FROM production_lines pl
     CROSS JOIN LATERAL jsonb_array_elements(pl.machine_sequence) elem
     WHERE pl.is_deleted = FALSE
       ${excludeClause}
       AND lower(elem->>'machineId') = ANY($1)`,
    params
  );

  return rows.map((row) => row.machine_id as string);
}

export async function listLines(_req: Request, res: Response): Promise<void> {
  try {
    const { rows } = await pool.query(
      `SELECT id, line_number, machine_sequence AS machines, is_active, created_at, updated_at
       FROM production_lines
       WHERE is_deleted = FALSE
       ORDER BY created_at DESC`
    );

    res.json(rows);
  } catch (err) {
    console.error('listLines error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function checkLineAvailability(req: Request, res: Response): Promise<void> {
  try {
    const lineNumber = String(req.query.lineNumber || '').trim();
    if (!lineNumber) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Numéro de ligne requis.');
      return;
    }

    const { rows } = await pool.query(
      'SELECT id FROM production_lines WHERE line_number = $1 AND is_deleted = FALSE',
      [lineNumber]
    );

    res.json({ exists: rows.length > 0 });
  } catch (err) {
    console.error('checkLineAvailability error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function checkLineConflicts(req: Request, res: Response): Promise<void> {
  try {
    const lineNumber = String(req.body?.lineNumber || '').trim();
    const machineIds = Array.isArray(req.body?.machineIds) ? req.body.machineIds : [];
    const lineId = req.body?.lineId ? Number(req.body.lineId) : undefined;

    if (!lineNumber) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Numéro de ligne requis.');
      return;
    }

    const { rows: existing } = await pool.query(
      'SELECT id FROM production_lines WHERE line_number = $1 AND is_deleted = FALSE',
      [lineNumber]
    );

    const conflicts = await findMachineConflicts(machineIds, lineId);
    const lineExists = existing.some((row) => (lineId ? row.id !== lineId : true));

    res.json({ lineExists, machineConflicts: conflicts });
  } catch (err) {
    console.error('checkLineConflicts error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function createLine(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createLineSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const { lineNumber, machines, isActive } = parsed.data;
    const { rows: existing } = await pool.query(
      'SELECT id FROM production_lines WHERE line_number = $1 AND is_deleted = FALSE',
      [lineNumber]
    );

    if (existing.length > 0) {
      sendError(res, 409, 'LINE_ALREADY_EXISTS', 'Ce numéro de ligne est déjà utilisé.');
      return;
    }

    const machineConflicts = await findMachineConflicts(machines.map((item) => item.machineId));
    if (machineConflicts.length > 0) {
      sendError(res, 409, 'MACHINE_ALREADY_EXISTS', 'Un ou plusieurs IDs machine existent déjà.');
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO production_lines (line_number, machine_sequence, is_active)
       VALUES ($1, $2, $3)
       RETURNING id, line_number, machine_sequence AS machines, is_active, created_at, updated_at`,
      [lineNumber, JSON.stringify(machines), isActive ?? true]
    );

    await createLineAuditEvent(rows[0].id, req.admin!.adminId, 'LINE_CREATED', {
      lineNumber,
      machinesCount: machines.length,
      isActive: isActive ?? true,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('createLine error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getLine(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, line_number, machine_sequence AS machines, is_active, created_at, updated_at
       FROM production_lines
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Ligne introuvable.');
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('getLine error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function updateLine(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const parsed = updateLineSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const updates = parsed.data;
    if (Object.keys(updates).length === 0) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Aucun champ à mettre à jour.');
      return;
    }

    if (updates.lineNumber) {
      const { rows: existing } = await pool.query(
        'SELECT id FROM production_lines WHERE line_number = $1 AND is_deleted = FALSE AND id != $2',
        [updates.lineNumber, id]
      );
      if (existing.length > 0) {
        sendError(res, 409, 'LINE_ALREADY_EXISTS', 'Ce numéro de ligne est déjà utilisé.');
        return;
      }
    }

    const { rows: currentRows } = await pool.query(
      `SELECT line_number, is_active, machine_sequence
       FROM production_lines
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );
    if (currentRows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Ligne introuvable.');
      return;
    }
    const current = currentRows[0];

    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];

    if (updates.lineNumber !== undefined) {
      params.push(updates.lineNumber);
      setClauses.push(`line_number = $${params.length}`);
    }
    if (updates.machines !== undefined) {
      const machineConflicts = await findMachineConflicts(
        updates.machines.map((item) => item.machineId),
        id
      );
      if (machineConflicts.length > 0) {
        sendError(res, 409, 'MACHINE_ALREADY_EXISTS', 'Un ou plusieurs IDs machine existent déjà.');
        return;
      }
      params.push(JSON.stringify(updates.machines));
      setClauses.push(`machine_sequence = $${params.length}`);
    }
    if (updates.isActive !== undefined) {
      params.push(updates.isActive);
      setClauses.push(`is_active = $${params.length}`);
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE production_lines SET ${setClauses.join(', ')}
       WHERE id = $${params.length} AND is_deleted = FALSE
       RETURNING id, line_number, machine_sequence AS machines, is_active, created_at, updated_at`,
      params
    );

    if (rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Ligne introuvable.');
      return;
    }

    await createLineAuditEvent(
      id,
      req.admin!.adminId,
      getLineEventType(current, updates),
      updates
    );

    res.json(rows[0]);
  } catch (err) {
    console.error('updateLine error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function deleteLine(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `UPDATE production_lines
       SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING id`,
      [id]
    );

    if (rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Ligne introuvable.');
      return;
    }

    await createLineAuditEvent(id, req.admin!.adminId, 'LINE_SOFT_DELETED', null);

    res.json({ message: 'Ligne supprimée.' });
  } catch (err) {
    console.error('deleteLine error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getLineImpact(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS incidents,
         COUNT(*) FILTER (WHERE status != 'CLOSED')::int AS open_or_pending_incidents
       FROM workshop_incidents
       WHERE line_id = $1`,
      [id]
    );

    res.json(rows[0] || { incidents: 0, open_or_pending_incidents: 0 });
  } catch (err) {
    console.error('getLineImpact error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
