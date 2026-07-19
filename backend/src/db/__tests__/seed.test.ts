const queryMock = jest.fn();
const hashAdminPasswordMock = jest.fn();
const infoMock = jest.fn();
const warnMock = jest.fn();

jest.mock('../pool', () => ({
  __esModule: true,
  default: { query: queryMock },
}));

jest.mock('../../auth/bcrypt', () => ({
  hashAdminPassword: hashAdminPasswordMock,
}));

jest.mock('../../logger', () => ({
  __esModule: true,
  default: { info: infoMock, warn: warnMock },
}));

import seedAdminAccount from '../seed';

const originalEnv = process.env;

describe('seedAdminAccount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, NODE_ENV: 'test' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('ne demande aucun secret de bootstrap lorsqu’un admin existe déjà', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, username: 'admin-existant' }] });

    await expect(seedAdminAccount()).resolves.toBeUndefined();

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(hashAdminPasswordMock).not.toHaveBeenCalled();
    expect(infoMock).toHaveBeenCalledWith(
      { configuredUsername: undefined, existingUsername: 'admin-existant' },
      'Admin account already exists. Skipping bootstrap seed.'
    );
  });

  it('ignore proprement le bootstrap incomplet hors production', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(seedAdminAccount()).resolves.toBeUndefined();

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledWith(
      'ADMIN_USERNAME and ADMIN_PASSWORD are required to bootstrap an empty database.'
    );
  });

  it('refuse une base de production vide sans identifiants de bootstrap', async () => {
    process.env.NODE_ENV = 'production';
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(seedAdminAccount()).rejects.toThrow(
      'ADMIN_USERNAME and ADMIN_PASSWORD are required to bootstrap an empty database.'
    );
  });

  it('crée le premier admin avec un identifiant normalisé', async () => {
    process.env.ADMIN_USERNAME = '  jury-admin  ';
    process.env.ADMIN_PASSWORD = 'mot-de-passe-temporaire-solide';
    queryMock
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ username: 'jury-admin' }], rowCount: 1 });
    hashAdminPasswordMock.mockResolvedValueOnce('bcrypt-hash');

    await expect(seedAdminAccount()).resolves.toBeUndefined();

    expect(hashAdminPasswordMock).toHaveBeenCalledWith('mot-de-passe-temporaire-solide');
    expect(queryMock).toHaveBeenNthCalledWith(
      2,
      `INSERT INTO admin_accounts (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (singleton_key) DO NOTHING
     RETURNING username`,
      ['jury-admin', 'bcrypt-hash']
    );
    expect(infoMock).toHaveBeenCalledWith({ username: 'jury-admin' }, 'Admin account created');
  });

  it('refuse un username admin purement numérique sur une base vide', async () => {
    process.env.ADMIN_USERNAME = '0012';
    process.env.ADMIN_PASSWORD = 'mot-de-passe-temporaire-solide';
    queryMock.mockResolvedValueOnce({ rows: [] });

    await expect(seedAdminAccount()).rejects.toThrow('uniquement numérique');
    expect(hashAdminPasswordMock).not.toHaveBeenCalled();
  });

  it('tolère deux démarrages concurrents grâce à la contrainte singleton', async () => {
    process.env.ADMIN_USERNAME = 'jury-admin';
    process.env.ADMIN_PASSWORD = 'mot-de-passe-temporaire-solide';
    queryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [], rowCount: 0 });
    hashAdminPasswordMock.mockResolvedValueOnce('bcrypt-hash');

    await expect(seedAdminAccount()).resolves.toBeUndefined();

    expect(infoMock).toHaveBeenCalledWith(
      { configuredUsername: 'jury-admin' },
      'Admin account was bootstrapped concurrently. Skipping duplicate seed.'
    );
  });
});
