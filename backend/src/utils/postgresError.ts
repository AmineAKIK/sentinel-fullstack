export interface PostgresErrorLike {
  code: string;
  constraint?: string;
}

export function isPostgresError(error: unknown): error is PostgresErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  );
}
