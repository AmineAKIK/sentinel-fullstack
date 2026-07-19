import { config } from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { Pool, PoolClient } from 'pg';
import { hashAdminPassword } from '../auth/bcrypt';
import { normalizeAdminUsername } from '../domain/identifiers';

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
    chars.push(CHARSET[crypto.randomInt(CHARSET.length)]);
  }
  return chars.join('');
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DB_URL });
  let client: PoolClient | null = null;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const configuredUsername = process.env.ADMIN_USERNAME
      ? normalizeAdminUsername(process.env.ADMIN_USERNAME)
      : undefined;
    const { rows } = await client.query<{ id: number; username: string }>(
      configuredUsername
        ? 'SELECT id, username FROM admin_accounts WHERE username = $1 FOR UPDATE'
        : 'SELECT id, username FROM admin_accounts ORDER BY id ASC LIMIT 1 FOR UPDATE',
      configuredUsername ? [configuredUsername] : []
    );

    if (rows.length === 0) {
      throw new Error(
        configuredUsername
          ? `Compte administrateur ${configuredUsername} introuvable.`
          : 'Aucun compte administrateur trouvé en base.'
      );
    }

    const admin = rows[0];
    const newPassword = generatePassword();
    const hash = await hashAdminPassword(newPassword);

    await client.query(
      `UPDATE admin_accounts
       SET password_hash = $1, session_version = session_version + 1, updated_at = NOW()
       WHERE id = $2`,
      [hash, admin.id]
    );
    await client.query('COMMIT');

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
    if (client) await client.query('ROLLBACK').catch(() => undefined);
    console.error('[reset-admin] Erreur :', err);
    process.exitCode = 1;
  } finally {
    client?.release();
    await pool.end();
  }
}

void main();
