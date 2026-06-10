import fs from 'fs';
import path from 'path';
import pool from './pool';
import { withTransaction } from './transaction';
import logger from '../logger';

async function runMigrations(): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationsDir = path.join(__dirname, '../../migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query(
        'SELECT filename FROM schema_migrations WHERE filename = $1',
        [file]
      );

      if (rows.length > 0) {
        logger.debug({ file }, 'Migration already applied');
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      logger.info({ file }, 'Applying migration');

      await withTransaction(async (txClient) => {
        await txClient.query(sql);
        await txClient.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
      });
      logger.info({ file }, 'Migration applied');
    }

    logger.info('All migrations complete.');
  } finally {
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
