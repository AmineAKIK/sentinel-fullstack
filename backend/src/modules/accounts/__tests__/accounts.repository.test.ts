jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
  },
}));

import pool from '../../../db/pool';
import { resetAccountPasswordData, setAccountActive } from '../accounts.repository';

const mockedPool = jest.mocked(pool);

const accountRow = {
  id: 1,
  first_name: 'Jean',
  last_name: 'Dupont',
  badge_number: 'B001',
  role: 'OPERATOR',
  is_active: true,
  email: null,
  has_password: true,
  has_password_setup_code: false,
  password_setup_expires_at: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
};

describe('accounts repository — révocation des sessions workshop', () => {
  beforeEach(() => {
    mockedPool.query.mockReset();
    mockedPool.query.mockResolvedValue({ rows: [accountRow] } as never);
  });

  it.each([true, false])(
    'révoque les sessions lors du changement d’activation vers %s',
    async (isActive) => {
      await setAccountActive(1, isActive);

      const [sql, params] = mockedPool.query.mock.calls[0];
      expect(String(sql)).toContain('CASE WHEN is_active IS DISTINCT FROM $2 THEN 1 ELSE 0 END');
      expect(params).toEqual([1, isActive]);
    }
  );

  it('incrémente session_version lors d’une réinitialisation de mot de passe', async () => {
    const expiresAt = new Date('2026-01-02T00:00:00Z');

    await resetAccountPasswordData(1, 'setup-code-hash', expiresAt);

    const [sql, params] = mockedPool.query.mock.calls[0];
    expect(String(sql)).toContain('password_hash = NULL');
    expect(String(sql)).toContain('session_version = session_version + 1');
    expect(params).toEqual([1, 'setup-code-hash', expiresAt]);
  });
});
