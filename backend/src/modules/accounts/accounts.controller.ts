import { Request, Response } from 'express';
import pool from '../../db/pool';
import { sendError } from '../../utils/errors';
import {
  createAccountSchema,
  updateAccountSchema,
} from './accounts.validation';
import { ZodError } from 'zod';

function formatZodError(err: ZodError): string {
  return err.errors.map((e) => e.message).join(' ');
}

async function createAuditEvent(
  targetUserId: number,
  adminId: number,
  eventType: string,
  changes: Record<string, unknown> | null
): Promise<void> {
  await pool.query(
    `INSERT INTO account_audit_events (target_user_id, admin_id, event_type, changes)
     VALUES ($1, $2, $3, $4)`,
    [targetUserId, adminId, eventType, changes ? JSON.stringify(changes) : null]
  );
}

export async function listAccounts(req: Request, res: Response): Promise<void> {
  try {
    const { role, sort, order } = req.query as {
      role?: string;
      sort?: string;
      order?: string;
    };

    const conditions: string[] = ['is_deleted = FALSE'];
    const params: unknown[] = [];

    if (role && ['OPERATOR', 'MAINTENANCE', 'RESPONSABLE'].includes(role)) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }

    const whereClause = conditions.join(' AND ');

    let orderClause: string;
    const safeOrder = order === 'asc' ? 'ASC' : 'DESC';

    if (sort === 'alphabetical') {
      orderClause = `last_name ${safeOrder}, first_name ${safeOrder}`;
    } else {
      orderClause = `created_at ${safeOrder}`;
    }

    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, badge_number, role, is_active,
              password_hash IS NOT NULL AS has_password, created_at, updated_at
       FROM sentinel_users
       WHERE ${whereClause}
       ORDER BY ${orderClause}`,
      params
    );

    res.json(rows);
  } catch (err) {
    console.error('listAccounts error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function checkBadgeAvailability(req: Request, res: Response): Promise<void> {
  try {
    const badgeNumber = String(req.query.badgeNumber || '').trim();
    if (!badgeNumber) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Numéro de badge requis.');
      return;
    }

    const { rows } = await pool.query(
      'SELECT id FROM sentinel_users WHERE badge_number = $1 AND is_deleted = FALSE',
      [badgeNumber]
    );

    res.json({ exists: rows.length > 0 });
  } catch (err) {
    console.error('checkBadgeAvailability error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function createAccount(req: Request, res: Response): Promise<void> {
  try {
    const parsed = createAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const { firstName, lastName, badgeNumber, role } = parsed.data;

    // Check badge uniqueness among non-deleted
    const { rows: existing } = await pool.query(
      'SELECT id FROM sentinel_users WHERE badge_number = $1 AND is_deleted = FALSE',
      [badgeNumber]
    );
    if (existing.length > 0) {
      sendError(res, 409, 'BADGE_ALREADY_EXISTS', 'Ce numéro de badge est déjà utilisé.');
      return;
    }

    const { rows } = await pool.query(
      `INSERT INTO sentinel_users (first_name, last_name, badge_number, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, first_name, last_name, badge_number, role, is_active,
                 password_hash IS NOT NULL AS has_password, created_at, updated_at`,
      [firstName, lastName, badgeNumber, role]
    );

    const created = rows[0];

    await createAuditEvent(created.id, req.admin!.adminId, 'USER_CREATED', {
      firstName,
      lastName,
      badgeNumber,
      role,
    });

    res.status(201).json(created);
  } catch (err) {
    console.error('createAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, badge_number, role, is_active,
              password_hash IS NOT NULL AS has_password, created_at, updated_at
       FROM sentinel_users
       WHERE id = $1 AND is_deleted = FALSE`,
      [id]
    );

    if (rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Utilisateur introuvable.');
      return;
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('getAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function updateAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const parsed = updateAccountSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_ERROR', formatZodError(parsed.error));
      return;
    }

    const updates = parsed.data;

    if (Object.keys(updates).length === 0) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Aucun champ à mettre à jour.');
      return;
    }

    // Fetch existing
    const { rows: existing } = await pool.query(
      'SELECT * FROM sentinel_users WHERE id = $1 AND is_deleted = FALSE',
      [id]
    );
    if (existing.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Utilisateur introuvable.');
      return;
    }

    const current = existing[0];

    // Check badge uniqueness if changing badge
    if (updates.badgeNumber && updates.badgeNumber !== current.badge_number) {
      const { rows: badgeCheck } = await pool.query(
        'SELECT id FROM sentinel_users WHERE badge_number = $1 AND is_deleted = FALSE AND id != $2',
        [updates.badgeNumber, id]
      );
      if (badgeCheck.length > 0) {
        sendError(res, 409, 'BADGE_ALREADY_EXISTS', 'Ce numéro de badge est déjà utilisé.');
        return;
      }
    }

    // Build update query dynamically
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [];
    const changes: Record<string, { old: unknown; new: unknown }> = {};

    if (updates.firstName !== undefined && updates.firstName !== current.first_name) {
      params.push(updates.firstName);
      setClauses.push(`first_name = $${params.length}`);
      changes.firstName = { old: current.first_name, new: updates.firstName };
    }
    if (updates.lastName !== undefined && updates.lastName !== current.last_name) {
      params.push(updates.lastName);
      setClauses.push(`last_name = $${params.length}`);
      changes.lastName = { old: current.last_name, new: updates.lastName };
    }
    if (updates.badgeNumber !== undefined && updates.badgeNumber !== current.badge_number) {
      params.push(updates.badgeNumber);
      setClauses.push(`badge_number = $${params.length}`);
      changes.badgeNumber = { old: current.badge_number, new: updates.badgeNumber };
    }
    if (updates.role !== undefined && updates.role !== current.role) {
      params.push(updates.role);
      setClauses.push(`role = $${params.length}`);
      changes.role = { old: current.role, new: updates.role };
    }

    if (Object.keys(changes).length === 0) {
      // Nothing changed, return current
      res.json({
        id: current.id,
        first_name: current.first_name,
        last_name: current.last_name,
        badge_number: current.badge_number,
        role: current.role,
        is_active: current.is_active,
        has_password: current.password_hash !== null,
        created_at: current.created_at,
        updated_at: current.updated_at,
      });
      return;
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE sentinel_users SET ${setClauses.join(', ')}
       WHERE id = $${params.length}
       RETURNING id, first_name, last_name, badge_number, role, is_active,
                 password_hash IS NOT NULL AS has_password, created_at, updated_at`,
      params
    );

    await createAuditEvent(id, req.admin!.adminId, 'USER_UPDATED', changes);

    res.json(rows[0]);
  } catch (err) {
    console.error('updateAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function activateAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `UPDATE sentinel_users SET is_active = TRUE, updated_at = NOW()
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING id, first_name, last_name, badge_number, role, is_active,
                 password_hash IS NOT NULL AS has_password, created_at, updated_at`,
      [id]
    );

    if (rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Utilisateur introuvable.');
      return;
    }

    await createAuditEvent(id, req.admin!.adminId, 'USER_ACTIVATED', null);

    res.json(rows[0]);
  } catch (err) {
    console.error('activateAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function deactivateAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `UPDATE sentinel_users SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING id, first_name, last_name, badge_number, role, is_active,
                 password_hash IS NOT NULL AS has_password, created_at, updated_at`,
      [id]
    );

    if (rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Utilisateur introuvable.');
      return;
    }

    await createAuditEvent(id, req.admin!.adminId, 'USER_DEACTIVATED', null);

    res.json(rows[0]);
  } catch (err) {
    console.error('deactivateAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function deleteAccount(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `UPDATE sentinel_users
       SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING id`,
      [id]
    );

    if (rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Utilisateur introuvable.');
      return;
    }

    await createAuditEvent(id, req.admin!.adminId, 'USER_SOFT_DELETED', null);

    res.json({ message: 'Utilisateur supprimé.' });
  } catch (err) {
    console.error('deleteAccount error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}

export async function getAccountImpact(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE user_id = $1)::int AS reported_incidents,
         COUNT(*) FILTER (WHERE taken_by_user_id = $1)::int AS taken_incidents
       FROM workshop_incidents`,
      [id]
    );

    res.json(rows[0] || { reported_incidents: 0, taken_incidents: 0 });
  } catch (err) {
    console.error('getAccountImpact error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}


export async function resetAccountPassword(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      sendError(res, 400, 'VALIDATION_ERROR', 'Identifiant invalide.');
      return;
    }

    const { rows } = await pool.query(
      `UPDATE sentinel_users
       SET password_hash = NULL, updated_at = NOW()
       WHERE id = $1 AND is_deleted = FALSE
       RETURNING id, first_name, last_name, badge_number, role, is_active,
                 password_hash IS NOT NULL AS has_password, created_at, updated_at`,
      [id]
    );

    if (rows.length === 0) {
      sendError(res, 404, 'NOT_FOUND', 'Utilisateur introuvable.');
      return;
    }

    await createAuditEvent(id, req.admin!.adminId, 'USER_PASSWORD_RESET', null);

    res.json(rows[0]);
  } catch (err) {
    console.error('resetAccountPassword error:', err);
    sendError(res, 500, 'SERVER_ERROR', 'Erreur interne du serveur.');
  }
}
