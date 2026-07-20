export function sqlStringList(values: readonly string[]): string {
  return values.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ');
}

export function statusInSql(column: string, statuses: readonly string[]): string {
  return `${column} IN (${sqlStringList(statuses)})`;
}

export function statusEqualsSql(column: string, status: string): string {
  return `${column} = '${status.replace(/'/g, "''")}'`;
}

export function statusNotEqualsSql(column: string, status: string): string {
  return `${column} != '${status.replace(/'/g, "''")}'`;
}

export function boundedInt(value: unknown, defaultValue: number, min: number, max: number): number {
  const parsed = Number.parseInt(
    typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '',
    10
  );
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : defaultValue;
}

export function parseOptionalInt(value: unknown): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(typeof value === 'string' ? value : String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}
