import bcrypt from 'bcrypt';
import pool from './pool';

async function seedAdminAccount(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) {
    console.warn('ADMIN_USERNAME or ADMIN_PASSWORD not set. Skipping seed.');
    return;
  }

  const { rows } = await pool.query(
    'SELECT id FROM admin_accounts WHERE username = $1',
    [username]
  );

  if (rows.length > 0) {
    console.log('Admin account already exists. Skipping seed.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await pool.query(
    'INSERT INTO admin_accounts (username, password_hash) VALUES ($1, $2)',
    [username, passwordHash]
  );

  console.log(`Admin account created: ${username}`);
}

export default seedAdminAccount;
