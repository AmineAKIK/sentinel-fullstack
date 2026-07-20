/**
 * Curseur opaque de pagination : { sortValue, id }. `sortValue` est la valeur
 * de la colonne de tri principale (ISO 8601 pour une date), `id` le
 * tie-breaker qui garantit un ordre total même en cas d'égalité de tri —
 * aucun des tris existants (created_at/updated_at) n'est unique à lui seul.
 */
export interface Cursor {
  sortValue: string;
  id: number;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(token: string): Cursor | null {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'sortValue' in decoded &&
      'id' in decoded &&
      typeof (decoded as Cursor).sortValue === 'string' &&
      typeof (decoded as Cursor).id === 'number' &&
      Number.isInteger((decoded as Cursor).id)
    ) {
      return decoded as Cursor;
    }
    return null;
  } catch {
    return null;
  }
}
