import {
  hashWorkshopPassword,
  MIN_PASSWORD_LENGTH_WORKSHOP,
  MAX_PASSWORD_LENGTH,
  verifyPassword,
} from '../../auth/bcrypt';
import { verifyWorkshopPasswordSetupCode } from '../../auth/setupCode';
import {
  findActiveWorkshopUserByBadge,
  setWorkshopUserPassword,
} from './workshopCredentials.repository';

export type LoginResult =
  | { kind: 'invalid_badge' }
  | { kind: 'requires_password_setup'; badgeNumber: string }
  | { kind: 'invalid_setup_code' }
  | { kind: 'expired_setup_code' }
  | { kind: 'requires_password'; badgeNumber: string }
  | { kind: 'invalid_password' }
  | { kind: 'success'; user: { id: number; first_name: string; last_name: string; badge_number: string; role: string } };

export async function loginWorkshopUserService(
  badgeNumber: string,
  password: string | undefined,
  newPassword: string | undefined,
  setupCode: string | undefined
): Promise<LoginResult> {
  const user = await findActiveWorkshopUserByBadge(badgeNumber);
  if (!user) return { kind: 'invalid_badge' };

  if (!user.password_hash) {
    if (
      !newPassword ||
      typeof newPassword !== 'string' ||
      newPassword.length < MIN_PASSWORD_LENGTH_WORKSHOP ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      return { kind: 'requires_password_setup', badgeNumber: user.badge_number };
    }
    if (!setupCode || typeof setupCode !== 'string') {
      return { kind: 'requires_password_setup', badgeNumber: user.badge_number };
    }
    if (!user.password_setup_token_hash || !user.password_setup_expires_at) {
      return { kind: 'expired_setup_code' };
    }
    if (user.password_setup_expires_at.getTime() <= Date.now()) {
      return { kind: 'expired_setup_code' };
    }
    const validSetupCode = await verifyWorkshopPasswordSetupCode(setupCode, user.password_setup_token_hash);
    if (!validSetupCode) return { kind: 'invalid_setup_code' };

    const passwordHash = await hashWorkshopPassword(newPassword);
    await setWorkshopUserPassword(user.id, passwordHash);
  } else {
    if (!password || typeof password !== 'string') {
      return { kind: 'requires_password', badgeNumber: user.badge_number };
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return { kind: 'invalid_password' };
  }

  return {
    kind: 'success',
    user: {
      id: user.id,
      first_name: user.first_name,
      last_name: user.last_name,
      badge_number: user.badge_number,
      role: user.role,
    },
  };
}
