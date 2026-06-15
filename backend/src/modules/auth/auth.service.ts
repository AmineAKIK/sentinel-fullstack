import { findAdminByUsername, getAdminPasswordHash, getAdminSessionVersion } from '../adminCredentials/adminCredentials.repository';
import { loginWorkshopUserService, LoginResult as WorkshopLoginResult } from '../workshopCredentials/workshopCredentials.service';
import { verifyPassword } from '../../auth/bcrypt';
import pool from '../../db/pool';

export type AuthLoginResult =
  | { kind: 'admin_requires_password' }
  | { kind: 'admin_success'; admin: { id: number; username: string; sessionVersion: number } }
  | { kind: 'workshop_requires_password_setup'; badgeNumber: string }
  | { kind: 'workshop_requires_password'; badgeNumber: string }
  | { kind: 'workshop_invalid_setup_code' }
  | { kind: 'workshop_expired_setup_code' }
  | { kind: 'workshop_success'; user: { id: number; first_name: string; last_name: string; badge_number: string; role: string } }
  | { kind: 'invalid_credentials' };

export interface AdminSessionInfo {
  id: number;
  username: string;
}

export interface WorkshopSessionInfo {
  id: number;
  first_name: string;
  last_name: string;
  badge_number: string;
  role: string;
}

export async function verifyAdminSession(adminId: number): Promise<AdminSessionInfo | null> {
  const { rows } = await pool.query<AdminSessionInfo>(
    'SELECT id, username FROM admin_accounts WHERE id = $1',
    [adminId]
  );
  return rows[0] ?? null;
}

export async function verifyWorkshopSession(userId: number, badgeNumber: string): Promise<WorkshopSessionInfo | null> {
  const { rows } = await pool.query<WorkshopSessionInfo>(
    `SELECT id, first_name, last_name, badge_number, role
     FROM sentinel_users
     WHERE id = $1 AND badge_number = $2 AND is_active = TRUE AND is_deleted = FALSE AND password_hash IS NOT NULL`,
    [userId, badgeNumber]
  );
  return rows[0] ?? null;
}

export async function unifiedLoginService(
  identifier: string,
  password: string | undefined,
  newPassword: string | undefined,
  setupCode: string | undefined
): Promise<AuthLoginResult> {
  // Try admin first: admin accounts use alphanumeric usernames
  const admin = await findAdminByUsername(identifier);
  if (admin) {
    if (!password) return { kind: 'admin_requires_password' };
    const passwordHash = await getAdminPasswordHash(admin.id);
    if (!passwordHash) return { kind: 'invalid_credentials' };
    const valid = await verifyPassword(password, passwordHash);
    if (!valid) return { kind: 'invalid_credentials' };
    const sessionVersion = (await getAdminSessionVersion(admin.id)) ?? 1;
    return { kind: 'admin_success', admin: { id: admin.id, username: admin.username, sessionVersion } };
  }

  // Not an admin — try workshop user by badge number
  const workshopResult: WorkshopLoginResult = await loginWorkshopUserService(
    identifier,
    password,
    newPassword,
    setupCode
  );

  switch (workshopResult.kind) {
    case 'invalid_badge':
      return { kind: 'invalid_credentials' };
    case 'requires_password_setup':
      return { kind: 'workshop_requires_password_setup', badgeNumber: workshopResult.badgeNumber };
    case 'requires_password':
      return { kind: 'workshop_requires_password', badgeNumber: workshopResult.badgeNumber };
    case 'invalid_setup_code':
      return { kind: 'workshop_invalid_setup_code' };
    case 'expired_setup_code':
      return { kind: 'workshop_expired_setup_code' };
    case 'invalid_password':
      return { kind: 'invalid_credentials' };
    case 'success':
      return { kind: 'workshop_success', user: workshopResult.user };
  }
}
