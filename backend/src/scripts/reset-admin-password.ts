import { config } from 'dotenv';
import path from 'path';
import { Pool } from 'pg';
import { hashAdminPassword } from '../auth/bcrypt';

config({ path: path.resolve(__dirname, '../../.env') });

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error('[reset-admin] DATABASE_URL manquant dans .env');
  process.exit(1);
}

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const LENGTH = 20;

function generatePassword(): string {
  const chars: string[] = [];
  for (let i = 0; i < LENGTH; i++) {
    chars.push(CHARSET[Math.floor(Math.random() * CHARSET.length)]);
  }
  return chars.join('');
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });

  try {
    const { rows } = await pool.query<{ id: number; username: string }>(
      'SELECT id, username FROM admin_accounts LIMIT 1'
    );

    if (rows.length === 0) {
      console.error('[reset-admin] Aucun compte administrateur trouvé en base.');
      process.exit(1);
    }

    const admin = rows[0];
    const newPassword = generatePassword();
    const hash = await hashAdminPassword(newPassword);

    await pool.query('BEGIN');
    await pool.query(
      'UPDATE admin_accounts SET password_hash = $1 WHERE id = $2',
      [hash, admin.id]
    );
    await pool.query(
      'UPDATE admin_accounts SET session_version = session_version + 1 WHERE id = $1',
      [admin.id]
    );
    await pool.query('COMMIT');

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  SENTINEL — RÉINITIALISATION MOT DE PASSE ADMIN');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Compte   : ${admin.username}`);
    console.log(`  Nouveau  : ${newPassword}`);
    console.log('───────────────────────────────────────────────────');
    console.log('  Connectez-vous et changez ce mot de passe');
    console.log('  immédiatement via Administration > Sécurité.');
    console.log('  Toutes les sessions actives ont été invalidées.');
    console.log('═══════════════════════════════════════════════════\n');
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => undefined);
    console.error('[reset-admin] Erreur :', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

void main();
