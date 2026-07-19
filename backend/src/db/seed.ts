import { hashAdminPassword } from '../auth/bcrypt';
import pool from './pool';
import logger from '../logger';
import { normalizeAdminUsername } from '../domain/identifiers';

async function seedAdminAccount(): Promise<void> {
  const configuredUsername = process.env.ADMIN_USERNAME?.trim();
  const { rows } = await pool.query<{ id: number; username: string }>(
    'SELECT id, username FROM admin_accounts ORDER BY id ASC LIMIT 1'
  );

  if (rows.length > 0) {
    logger.info(
      { configuredUsername, existingUsername: rows[0].username },
      'Admin account already exists. Skipping bootstrap seed.'
    );
    return;
  }

  const username = configuredUsername ? normalizeAdminUsername(configuredUsername) : undefined;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    const message =
      'ADMIN_USERNAME and ADMIN_PASSWORD are required to bootstrap an empty database.';
    if (process.env.NODE_ENV === 'production') throw new Error(message);
    logger.warn(message);
    return;
  }

  const passwordHash = await hashAdminPassword(password);
  const insertResult = await pool.query<{ username: string }>(
    `INSERT INTO admin_accounts (username, password_hash)
     VALUES ($1, $2)
     ON CONFLICT (singleton_key) DO NOTHING
     RETURNING username`,
    [username, passwordHash]
  );

  if (insertResult.rows[0]) {
    logger.info({ username }, 'Admin account created');
  } else {
    logger.info(
      { configuredUsername: username },
      'Admin account was bootstrapped concurrently. Skipping duplicate seed.'
    );
  }
}

export default seedAdminAccount;
