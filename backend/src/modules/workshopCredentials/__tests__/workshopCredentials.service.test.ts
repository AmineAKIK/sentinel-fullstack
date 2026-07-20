import { loginWorkshopUserService } from '../workshopCredentials.service';

jest.mock('../workshopCredentials.repository', () => ({
  findWorkshopUserByBadge: jest.fn(),
  consumeWorkshopPasswordSetupCode: jest.fn(),
}));

jest.mock('../../../auth/bcrypt', () => ({
  MIN_PASSWORD_LENGTH_WORKSHOP: 10,
  hasMinimumPasswordLength: (value: string, minimum: number) => Array.from(value).length >= minimum,
  isWithinBcryptByteLimit: (value: string) => Buffer.byteLength(value, 'utf8') <= 72,
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
    session_version: 0,
    password_hash: null,
    password_setup_token_hash: 'hashed-setup-code',
    password_setup_expires_at: new Date('2099-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(repo.consumeWorkshopPasswordSetupCode).mockResolvedValue(mockUser());
});

describe('loginWorkshopUserService – setup initial', () => {
  it("ne révèle pas qu'un badge est inconnu à la première étape", async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(null);

    const result = await loginWorkshopUserService('9999', undefined, undefined, undefined);

    expect(result).toEqual({ kind: 'requires_password', badgeNumber: '9999' });
  });

  it("ne révèle pas qu'un compte est inactif à la première étape", async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser({ is_active: false }));

    const result = await loginWorkshopUserService('3002', undefined, undefined, undefined);

    expect(result).toEqual({ kind: 'requires_password', badgeNumber: '3002' });
  });

  it('refuse un compte inactif après soumission de credentials', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser({ is_active: false }));

    const result = await loginWorkshopUserService('3002', 'secret1', undefined, undefined);

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

    const result = await loginWorkshopUserService('3002', undefined, 'secret1234', undefined);

    expect(result).toEqual({ kind: 'requires_password_setup', badgeNumber: '3002' });
    expect(setupCode.verifyWorkshopPasswordSetupCode).not.toHaveBeenCalled();
  });

  it('rejette un setup sans code actif', async () => {
    jest
      .mocked(repo.findWorkshopUserByBadge)
      .mockResolvedValue(
        mockUser({ password_setup_token_hash: null, password_setup_expires_at: null })
      );

    const result = await loginWorkshopUserService('3002', undefined, 'secret1234', 'ABCD234567');

    expect(result).toEqual({ kind: 'expired_setup_code' });
  });

  it('rejette un code temporaire expiré', async () => {
    jest
      .mocked(repo.findWorkshopUserByBadge)
      .mockResolvedValue(mockUser({ password_setup_expires_at: new Date('2000-01-01T00:00:00Z') }));

    const result = await loginWorkshopUserService('3002', undefined, 'secret1234', 'ABCD234567');

    expect(result).toEqual({ kind: 'expired_setup_code' });
  });

  it('rejette un code temporaire incorrect', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser());
    jest.mocked(setupCode.verifyWorkshopPasswordSetupCode).mockResolvedValue(false);

    const result = await loginWorkshopUserService('3002', undefined, 'secret1234', 'WRONG');

    expect(result).toEqual({ kind: 'invalid_setup_code' });
    expect(repo.consumeWorkshopPasswordSetupCode).not.toHaveBeenCalled();
  });

  it('définit le mot de passe puis retourne la session si le code est valide', async () => {
    jest.mocked(repo.findWorkshopUserByBadge).mockResolvedValue(mockUser());
    jest.mocked(setupCode.verifyWorkshopPasswordSetupCode).mockResolvedValue(true);

    const result = await loginWorkshopUserService('3002', undefined, 'secret1234', 'ABCD234567');

    expect(result).toEqual({
      kind: 'success',
      user: {
        id: 1,
        first_name: 'Sarah',
        last_name: 'Kaci',
        badge_number: '3002',
        role: 'OPERATOR',
        sessionVersion: 0,
      },
    });
    expect(bcrypt.hashWorkshopPassword).toHaveBeenCalledWith('secret1234');
    expect(repo.consumeWorkshopPasswordSetupCode).toHaveBeenCalledWith({
      userId: 1,
      passwordHash: 'hashed-password',
      expectedSetupTokenHash: 'hashed-setup-code',
    });
  });

  it("ne retourne pas de session lorsqu'une requête concurrente a déjà consommé le code", async () => {
    jest
      .mocked(repo.findWorkshopUserByBadge)
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce(
        mockUser({
          password_hash: 'winning-password-hash',
          password_setup_token_hash: null,
          password_setup_expires_at: null,
        })
      );
    jest.mocked(setupCode.verifyWorkshopPasswordSetupCode).mockResolvedValue(true);
    jest.mocked(repo.consumeWorkshopPasswordSetupCode).mockResolvedValue(null);

    const result = await loginWorkshopUserService(
      '3002',
      undefined,
      'losing-password',
      'ABCD234567'
    );

    expect(result).toEqual({ kind: 'requires_password', badgeNumber: '3002' });
  });

  it.each([
    ['un compte supprimé', null, { kind: 'invalid_badge' }],
    ['un compte désactivé', mockUser({ is_active: false }), { kind: 'account_disabled' }],
    [
      'un code supprimé',
      mockUser({ password_setup_token_hash: null, password_setup_expires_at: null }),
      { kind: 'expired_setup_code' },
    ],
    [
      'un code remplacé',
      mockUser({ password_setup_token_hash: 'replacement-setup-hash' }),
      { kind: 'invalid_setup_code' },
    ],
  ])('reclasse sans succès %s pendant la consommation', async (_label, currentUser, expected) => {
    jest
      .mocked(repo.findWorkshopUserByBadge)
      .mockResolvedValueOnce(mockUser())
      .mockResolvedValueOnce(currentUser);
    jest.mocked(setupCode.verifyWorkshopPasswordSetupCode).mockResolvedValue(true);
    jest.mocked(repo.consumeWorkshopPasswordSetupCode).mockResolvedValue(null);

    const result = await loginWorkshopUserService(
      '3002',
      undefined,
      'losing-password',
      'ABCD234567'
    );

    expect(result).toEqual(expected);
  });
});

describe('loginWorkshopUserService – mot de passe existant', () => {
  it('demande le mot de passe si le compte en possède déjà un', async () => {
    jest
      .mocked(repo.findWorkshopUserByBadge)
      .mockResolvedValue(mockUser({ password_hash: 'hash' }));

    const result = await loginWorkshopUserService('3002', undefined, undefined, undefined);

    expect(result).toEqual({ kind: 'requires_password', badgeNumber: '3002' });
  });

  it('rejette un mot de passe incorrect', async () => {
    jest
      .mocked(repo.findWorkshopUserByBadge)
      .mockResolvedValue(mockUser({ password_hash: 'hash' }));
    jest.mocked(bcrypt.verifyPassword).mockResolvedValue(false);

    const result = await loginWorkshopUserService('3002', 'bad', undefined, undefined);

    expect(result).toEqual({ kind: 'invalid_password' });
  });

  it('retourne la session si le mot de passe est correct', async () => {
    jest
      .mocked(repo.findWorkshopUserByBadge)
      .mockResolvedValue(mockUser({ password_hash: 'hash' }));
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
        sessionVersion: 0,
      },
    });
    expect(bcrypt.verifyPassword).toHaveBeenCalledWith('secret1', 'hash');
  });
});
