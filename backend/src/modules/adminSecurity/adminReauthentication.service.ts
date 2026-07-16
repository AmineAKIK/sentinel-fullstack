import { verifyPassword } from '../../auth/bcrypt';
import { createRateLimit } from '../../utils/inMemoryRateLimit';
import {
  getAdminPasswordHash,
  incrementAdminSessionVersion,
} from '../adminCredentials/adminCredentials.repository';

const REAUTH_MAX_FAILURES = 5;
const REAUTH_WINDOW_MS = 30 * 60 * 1000;
const failures = createRateLimit(REAUTH_MAX_FAILURES, REAUTH_WINDOW_MS);

export type AdminReauthenticationResult =
  { ok: true } | { ok: false; reason: 'ACCOUNT_MISSING' | 'INVALID_PASSWORD' | 'SESSION_REVOKED' };

export async function reauthenticateAdmin(
  adminId: number,
  password: string
): Promise<AdminReauthenticationResult> {
  const passwordHash = await getAdminPasswordHash(adminId);
  if (!passwordHash) return { ok: false, reason: 'ACCOUNT_MISSING' };

  const valid = await verifyPassword(password, passwordHash);
  if (valid) {
    failures.reset(adminId);
    return { ok: true };
  }

  const failureCount = failures.increment(adminId);
  if (failureCount >= REAUTH_MAX_FAILURES) {
    failures.reset(adminId);
    await incrementAdminSessionVersion(adminId);
    return { ok: false, reason: 'SESSION_REVOKED' };
  }

  return { ok: false, reason: 'INVALID_PASSWORD' };
}
