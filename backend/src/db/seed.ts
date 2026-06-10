import { hashAdminPassword } from '../auth/bcrypt';
import pool from './pool';
import logger from '../logger';

async function seedAdminAccount(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    logger.warn('ADMIN_USERNAME or ADMIN_PASSWORD not set. Skipping seed.');
    return;
  }

  const { rows } = await pool.query(
    'SELECT id FROM admin_accounts WHERE username = $1',
    [username]
  );

  if (rows.length > 0) {
    logger.info('Admin account already exists. Skipping seed.');
    return;
  }

  const passwordHash = await hashAdminPassword(password);
  await pool.query(
    'INSERT INTO admin_accounts (username, password_hash) VALUES ($1, $2)',
    [username, passwordHash]
  );

  logger.info({ username }, 'Admin account created');
}

export default seedAdminAccount;
