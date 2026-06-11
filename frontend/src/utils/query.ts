export type QueryValue = string | number | boolean | null | undefined;

export function buildQuery<TParams extends object>(params: TParams): string {
  const query = new URLSearchParams();

  Object.entries(params as Record<string, QueryValue>).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });

  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export function buildRequiredQuery<TParams extends object>(params: TParams): string {
  return new URLSearchParams(
    Object.fromEntries(
      Object.entries(params as Record<string, QueryValue>)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)])
    )
  ).toString();
}
