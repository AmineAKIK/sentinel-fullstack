jest.mock('../../../db/pool', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import pool from '../../../db/pool';
import { consumeWorkshopPasswordSetupCode } from '../workshopCredentials.repository';

const mockedPool = jest.mocked(pool);

const authenticatedUser = {
  id: 7,
  first_name: 'Sarah',
  last_name: 'Kaci',
  badge_number: '3002',
  role: 'OPERATOR',
  session_version: 3,
};

beforeEach(() => {
  mockedPool.query.mockReset();
});

it('consomme le code et définit le mot de passe dans un unique UPDATE conditionnel', async () => {
  mockedPool.query.mockResolvedValueOnce({ rows: [authenticatedUser] } as never);

  await expect(
    consumeWorkshopPasswordSetupCode({
      userId: 7,
      passwordHash: 'new-password-hash',
      expectedSetupTokenHash: 'expected-setup-hash',
    })
  ).resolves.toEqual(authenticatedUser);

  const [query, parameters] = mockedPool.query.mock.calls[0];
  const sql = String(query);
  expect(sql).toContain('password_hash IS NULL');
  expect(sql).toContain('password_setup_token_hash = $3');
  expect(sql).toContain('password_setup_expires_at > NOW()');
  expect(sql).toContain('is_active = TRUE');
  expect(sql).toContain('is_deleted = FALSE');
  expect(sql).toContain('RETURNING id, first_name, last_name, badge_number, role, session_version');
  expect(parameters).toEqual([7, 'new-password-hash', 'expected-setup-hash']);
});

it('ne retourne aucun utilisateur lorsque le code a déjà été consommé', async () => {
  mockedPool.query.mockResolvedValueOnce({ rows: [] } as never);

  await expect(
    consumeWorkshopPasswordSetupCode({
      userId: 7,
      passwordHash: 'losing-password-hash',
      expectedSetupTokenHash: 'consumed-setup-hash',
    })
  ).resolves.toBeNull();
});
