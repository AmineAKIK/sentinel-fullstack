jest.mock('../../adminCredentials/adminCredentials.repository', () => ({
  getAdminPasswordHash: jest.fn(),
  incrementAdminSessionVersion: jest.fn(),
}));

jest.mock('../../../auth/bcrypt', () => ({
  verifyPassword: jest.fn(),
}));

import { verifyPassword } from '../../../auth/bcrypt';
import * as credentials from '../../adminCredentials/adminCredentials.repository';
import { reauthenticateAdmin } from '../adminReauthentication.service';

beforeEach(() => {
  jest.clearAllMocks();
});

it('accepts valid credentials and keeps the session active', async () => {
  jest.mocked(credentials.getAdminPasswordHash).mockResolvedValue('hash');
  jest.mocked(verifyPassword).mockResolvedValue(true);

  await expect(reauthenticateAdmin(101, 'correct')).resolves.toEqual({ ok: true });
  expect(credentials.incrementAdminSessionVersion).not.toHaveBeenCalled();
});

it('does not reveal a missing administrator account', async () => {
  jest.mocked(credentials.getAdminPasswordHash).mockResolvedValue(null);

  await expect(reauthenticateAdmin(102, 'anything')).resolves.toEqual({
    ok: false,
    reason: 'ACCOUNT_MISSING',
  });
});

it('revokes every admin session after five failures shared across critical endpoints', async () => {
  jest.mocked(credentials.getAdminPasswordHash).mockResolvedValue('hash');
  jest.mocked(verifyPassword).mockResolvedValue(false);

  for (let attempt = 1; attempt < 5; attempt += 1) {
    await expect(reauthenticateAdmin(103, 'wrong')).resolves.toEqual({
      ok: false,
      reason: 'INVALID_PASSWORD',
    });
  }
  await expect(reauthenticateAdmin(103, 'wrong')).resolves.toEqual({
    ok: false,
    reason: 'SESSION_REVOKED',
  });
  expect(credentials.incrementAdminSessionVersion).toHaveBeenCalledWith(103);
});
