import { Pool } from 'pg';
import runMigrations from '../../db/migrate';

const DB_URL = process.env.DATABASE_URL!;
const prefix = `95${process.pid}${Date.now()}`;

function fixtureLine(suffix: number): string {
  return `${prefix}${suffix}`;
}

let pool: Pool;

function machine(machineId: string): object {
  return {
    machineId,
    brand: 'Integration',
    hasDoubleRobot: false,
    robotNumber: 'R-01',
    robotHeads: 2,
  };
}

async function cleanup(): Promise<void> {
  await pool.query('DELETE FROM production_lines WHERE line_number LIKE $1', [`${prefix}%`]);
}

beforeAll(async () => {
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();
  await cleanup();
}, 30_000);

afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe('Production line integrity (real DB)', () => {
  it('arbitre atomiquement deux créations concurrentes utilisant la même machine', async () => {
    const results = await Promise.allSettled([
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [fixtureLine(1), JSON.stringify([machine(`${prefix}-MACHINE`)])]
      ),
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [fixtureLine(2), JSON.stringify([machine(`${prefix}-machine`)])]
      ),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    );
    expect(rejected?.reason).toMatchObject({
      code: '23505',
      constraint: 'idx_production_line_machines_global_id',
    });
  });

  it('refuse deux numéros de ligne numériques identiques', async () => {
    const duplicateLine = fixtureLine(3);
    await pool.query(
      `INSERT INTO production_lines (line_number, machine_sequence, is_active)
       VALUES ($1, $2, TRUE)`,
      [duplicateLine, JSON.stringify([machine(`${prefix}-M-2`)])]
    );

    await expect(
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [duplicateLine, JSON.stringify([machine(`${prefix}-M-3`)])]
      )
    ).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('refuse un payload machine qui contourne la validation HTTP', async () => {
    await expect(
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [
          fixtureLine(4),
          JSON.stringify([{ machineId: `${prefix}-M-4`, brand: 'X', hasDoubleRobot: false }]),
        ]
      )
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('libère l’ID machine lors de l’archivage logique de la ligne', async () => {
    const machineId = `${prefix}-REUSABLE`;
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO production_lines (line_number, machine_sequence, is_active)
       VALUES ($1, $2, TRUE)
       RETURNING id`,
      [fixtureLine(5), JSON.stringify([machine(machineId)])]
    );
    await pool.query('UPDATE production_lines SET is_deleted = TRUE WHERE id = $1', [rows[0].id]);

    await expect(
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [fixtureLine(6), JSON.stringify([machine(machineId)])]
      )
    ).resolves.toBeDefined();
  });
});
