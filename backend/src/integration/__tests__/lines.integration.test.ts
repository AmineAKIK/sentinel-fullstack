import { Pool } from 'pg';
import runMigrations from '../../db/migrate';

const DB_URL = process.env.DATABASE_URL;
const describeIntegration = DB_URL ? describe : describe.skip;
const prefix = `INT-LINE-${process.pid}`;

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
  if (!DB_URL) return;
  pool = new Pool({ connectionString: DB_URL });
  await runMigrations();
  await cleanup();
}, 30_000);

afterAll(async () => {
  if (!DB_URL) return;
  await cleanup();
  await pool.end();
});

describeIntegration('Production line integrity (real DB)', () => {
  it('arbitre atomiquement deux créations concurrentes utilisant la même machine', async () => {
    const results = await Promise.allSettled([
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [`${prefix}-A`, JSON.stringify([machine(`${prefix}-MACHINE`)])]
      ),
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [`${prefix}-B`, JSON.stringify([machine(`${prefix}-machine`)])]
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

  it('refuse les numéros de ligne équivalents après normalisation', async () => {
    await pool.query(
      `INSERT INTO production_lines (line_number, machine_sequence, is_active)
       VALUES ($1, $2, TRUE)`,
      [`${prefix}-NORMALIZED`, JSON.stringify([machine(`${prefix}-M-2`)])]
    );

    await expect(
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [`  ${prefix.toLowerCase()}-normalized  `, JSON.stringify([machine(`${prefix}-M-3`)])]
      )
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'idx_production_lines_normalized_number_active',
    });
  });

  it('refuse un payload machine qui contourne la validation HTTP', async () => {
    await expect(
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [
          `${prefix}-INVALID`,
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
      [`${prefix}-ARCHIVE`, JSON.stringify([machine(machineId)])]
    );
    await pool.query('UPDATE production_lines SET is_deleted = TRUE WHERE id = $1', [rows[0].id]);

    await expect(
      pool.query(
        `INSERT INTO production_lines (line_number, machine_sequence, is_active)
         VALUES ($1, $2, TRUE)`,
        [`${prefix}-REUSE`, JSON.stringify([machine(machineId)])]
      )
    ).resolves.toBeDefined();
  });
});
