import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from './pool';
import logger from '../logger';

const MIGRATION_LOCK_NAME = 'sentinel_schema_migrations';
const MIGRATION_FILENAME_ALIASES: Readonly<Record<string, string>> = {
  '038_create_workshop_arbitration_reads.sql': '038_create_workshop_arbitration_consultations.sql',
};

function checksum(sql: string): string {
  return crypto.createHash('sha256').update(sql, 'utf8').digest('hex');
}

async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_NAME]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR PRIMARY KEY,
        checksum VARCHAR(64),
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(
      'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum VARCHAR(64)'
    );

    const migrationsDir = path.join(__dirname, '../../migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const [legacyFilename, canonicalFilename] of Object.entries(MIGRATION_FILENAME_ALIASES)) {
      const canonicalPath = path.join(migrationsDir, canonicalFilename);
      if (!files.includes(canonicalFilename) || !fs.existsSync(canonicalPath)) {
        throw new Error(
          `Migration alias ${legacyFilename} references missing file ${canonicalFilename}.`
        );
      }

      const expectedChecksum = checksum(fs.readFileSync(canonicalPath, 'utf8'));
      const { rows } = await client.query<{ filename: string; checksum: string | null }>(
        `SELECT filename, checksum
         FROM schema_migrations
         WHERE filename IN ($1, $2)
         ORDER BY filename`,
        [legacyFilename, canonicalFilename]
      );
      const legacy = rows.find((row) => row.filename === legacyFilename);
      const canonical = rows.find((row) => row.filename === canonicalFilename);
      if (!legacy) continue;
      if (legacy.checksum && legacy.checksum !== expectedChecksum) {
        throw new Error(`Migration alias checksum mismatch for ${legacyFilename}.`);
      }
      if (canonical?.checksum && canonical.checksum !== expectedChecksum) {
        throw new Error(`Migration checksum mismatch for ${canonicalFilename}.`);
      }

      if (canonical) {
        await client.query('DELETE FROM schema_migrations WHERE filename = $1', [legacyFilename]);
      } else {
        await client.query(
          `UPDATE schema_migrations
           SET filename = $2, checksum = $3
           WHERE filename = $1`,
          [legacyFilename, canonicalFilename, expectedChecksum]
        );
      }
      logger.warn({ legacyFilename, canonicalFilename }, 'Normalized legacy migration filename');
    }

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const fileChecksum = checksum(sql);
      const { rows } = await client.query<{ filename: string; checksum: string | null }>(
        'SELECT filename, checksum FROM schema_migrations WHERE filename = $1',
        [file]
      );

      if (rows.length > 0) {
        if (rows[0].checksum && rows[0].checksum !== fileChecksum) {
          throw new Error(`Migration checksum mismatch for ${file}: file changed after apply.`);
        }
        if (!rows[0].checksum) {
          await client.query(
            'UPDATE schema_migrations SET checksum = $2 WHERE filename = $1 AND checksum IS NULL',
            [file, fileChecksum]
          );
          logger.warn({ file }, 'Recorded checksum for legacy migration');
        }
        logger.debug({ file }, 'Migration already applied');
        continue;
      }

      logger.info({ file }, 'Applying migration');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
          file,
          fileChecksum,
        ]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      logger.info({ file }, 'Migration applied');
    }

    const { rows: ledgerRows } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations ORDER BY filename'
    );
    const migrationFiles = new Set(files);
    const missingFiles = ledgerRows
      .map((row) => row.filename)
      .filter((filename) => !migrationFiles.has(filename));
    if (missingFiles.length > 0) {
      throw new Error(`Migration ledger references missing files: ${missingFiles.join(', ')}`);
    }

    const { rows: incompleteRows } = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations WHERE checksum IS NULL ORDER BY filename'
    );
    if (incompleteRows.length > 0) {
      throw new Error(
        `Migration ledger has missing checksums: ${incompleteRows.map((row) => row.filename).join(', ')}`
      );
    }
    await client.query('ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL');

    logger.info('All migrations complete.');
  } finally {
    await client
      .query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_NAME])
      .catch(() => undefined);
    client.release();
  }
}

export default runMigrations;

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.error({ err }, 'Migration failed');
      process.exit(1);
    });
}
