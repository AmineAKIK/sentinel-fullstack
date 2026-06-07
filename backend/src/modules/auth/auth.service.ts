import { findAdminByUsername, getAdminPasswordHash } from '../adminCredentials/adminCredentials.repository';
import { loginWorkshopUserService, LoginResult as WorkshopLoginResult } from '../workshopCredentials/workshopCredentials.service';
import { verifyPassword } from '../../auth/bcrypt';

export type AuthLoginResult =
  | { kind: 'admin_requires_password'; username: string }
  | { kind: 'admin_success'; admin: { id: number; username: string } }
  | { kind: 'workshop_requires_password_setup'; badgeNumber: string }
  | { kind: 'workshop_requires_password'; badgeNumber: string }
  | { kind: 'workshop_invalid_setup_code' }
  | { kind: 'workshop_expired_setup_code' }
  | { kind: 'workshop_success'; user: { id: number; first_name: string; last_name: string; badge_number: string; role: string } }
  | { kind: 'invalid_credentials' };

export async function unifiedLoginService(
  identifier: string,
  password: string | undefined,
  newPassword: string | undefined,
  setupCode: string | undefined
): Promise<AuthLoginResult> {
  // Try admin first: admin accounts use alphanumeric usernames
  const admin = await findAdminByUsername(identifier);
  if (admin) {
    if (!password) return { kind: 'admin_requires_password', username: admin.username };
    const passwordHash = await getAdminPasswordHash(admin.id);
    if (!passwordHash) return { kind: 'invalid_credentials' };
    const valid = await verifyPassword(password, passwordHash);
    if (!valid) return { kind: 'invalid_credentials' };
    return { kind: 'admin_success', admin: { id: admin.id, username: admin.username } };
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
