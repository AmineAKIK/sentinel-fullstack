import { loginWorkshopUserService } from '../workshopCredentials.service';

jest.mock('../workshopCredentials.repository', () => ({
  findWorkshopUserByBadge: jest.fn(),
  setWorkshopUserPassword: jest.fn(),
}));

jest.mock('../../../auth/bcrypt', () => ({
  MIN_PASSWORD_LENGTH_WORKSHOP: 6,
  hashWorkshopPassword: jest.fn(() => Promise.resolve('hashed-password')),
  verifyPassword: jest.fn(),
}));

jest.mock('../../../auth/setupCode', () => ({
  verifyWorkshopPasswordSetupCode: jest.fn(),
}));

import * as repo from '../workshopCredentials.repository';
import * as bcrypt from '../../../auth/bcrypt';
import * as setupCode from '../../../auth/setupCode';

function mockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    first_name: 'Sarah',
    last_name: 'Kaci',
    badge_number: '3002',
    role: 'OPERATOR',
    is_active: true,
    password_hash: null,
    password_setup_token_hash: 'hashed-setup-code',
    password_setup_expires_at: new Date('2099-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('loginWorkshopUserService – setup initial', () => {
  it('retourne invalid_badge si le badge est inconnu', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(null);

    const result = await loginWorkshopUserService('9999', undefined, undefined, undefined);

    expect(result).toEqual({ kind: 'invalid_badge' });
  });

  it('retourne account_disabled si le compte est inactif', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser({ is_active: false }));

    const result = await loginWorkshopUserService('3002', undefined, undefined, undefined);

    expect(result).toEqual({ kind: 'account_disabled' });
  });

  it("demande le setup si aucun mot de passe nouveau valide n'est fourni", async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser());

    const result = await loginWorkshopUserService('3002', undefined, '123', 'ABCD234567');

    expect(result).toEqual({ kind: 'requires_password_setup', badgeNumber: '3002' });
    expect(setupCode.verifyWorkshopPasswordSetupCode).not.toHaveBeenCalled();
  });

  it('demande le setup si le code temporaire est absent', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser());

    const result = await loginWorkshopUserService('3002', undefined, 'secret1', undefined);

    expect(result).toEqual({ kind: 'requires_password_setup', badgeNumber: '3002' });
    expect(setupCode.verifyWorkshopPasswordSetupCode).not.toHaveBeenCalled();
  });

  it('rejette un setup sans code actif', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(
      mockUser({ password_setup_token_hash: null, password_setup_expires_at: null })
    );

    const result = await loginWorkshopUserService('3002', undefined, 'secret1', 'ABCD234567');

    expect(result).toEqual({ kind: 'expired_setup_code' });
  });

  it('rejette un code temporaire expiré', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(
      mockUser({ password_setup_expires_at: new Date('2000-01-01T00:00:00Z') })
    );

    const result = await loginWorkshopUserService('3002', undefined, 'secret1', 'ABCD234567');

    expect(result).toEqual({ kind: 'expired_setup_code' });
  });

  it('rejette un code temporaire incorrect', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser());
    jest.mocked(setupCode.verifyWorkshopPasswordSetupCode).mockResolvedValue(false);

    const result = await loginWorkshopUserService('3002', undefined, 'secret1', 'WRONG');

    expect(result).toEqual({ kind: 'invalid_setup_code' });
    expect(repo.setWorkshopUserPassword).not.toHaveBeenCalled();
  });

  it('définit le mot de passe puis retourne la session si le code est valide', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser());
    jest.mocked(setupCode.verifyWorkshopPasswordSetupCode).mockResolvedValue(true);

    const result = await loginWorkshopUserService('3002', undefined, 'secret1', 'ABCD234567');

    expect(result).toEqual({
      kind: 'success',
      user: {
        id: 1,
        first_name: 'Sarah',
        last_name: 'Kaci',
        badge_number: '3002',
        role: 'OPERATOR',
      },
    });
    expect(bcrypt.hashWorkshopPassword).toHaveBeenCalledWith('secret1');
    expect(repo.setWorkshopUserPassword).toHaveBeenCalledWith(1, 'hashed-password');
  });
});

describe('loginWorkshopUserService – mot de passe existant', () => {
  it('demande le mot de passe si le compte en possède déjà un', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser({ password_hash: 'hash' }));

    const result = await loginWorkshopUserService('3002', undefined, undefined, undefined);

    expect(result).toEqual({ kind: 'requires_password', badgeNumber: '3002' });
  });

  it('rejette un mot de passe incorrect', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser({ password_hash: 'hash' }));
    jest.mocked(bcrypt.verifyPassword).mockResolvedValue(false);

    const result = await loginWorkshopUserService('3002', 'bad', undefined, undefined);

    expect(result).toEqual({ kind: 'invalid_password' });
  });

  it('retourne la session si le mot de passe est correct', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser({ password_hash: 'hash' }));
    jest.mocked(bcrypt.verifyPassword).mockResolvedValue(true);

    const result = await loginWorkshopUserService('3002', 'secret1', undefined, undefined);

    expect(result).toEqual({
      kind: 'success',
      user: {
        id: 1,
        first_name: 'Sarah',
        last_name: 'Kaci',
        badge_number: '3002',
        role: 'OPERATOR',
      },
    });
    expect(bcrypt.verifyPassword).toHaveBeenCalledWith('secret1', 'hash');
  });
});
