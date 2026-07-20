import { decodeCursor, encodeCursor } from '../cursor';

describe('cursor', () => {
  it('round-trips a cursor through encode/decode', () => {
    const cursor = { sortValue: '2026-03-15T10:00:00.000Z', id: 42 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('rejects a malformed base64url token', () => {
    expect(decodeCursor('not-valid-base64url-json')).toBeNull();
  });

  it('rejects a token that decodes to something other than {sortValue, id}', () => {
    const token = Buffer.from(JSON.stringify({ foo: 'bar' }), 'utf8').toString('base64url');
    expect(decodeCursor(token)).toBeNull();
  });

  it('rejects a token whose id is not an integer', () => {
    const token = Buffer.from(
      JSON.stringify({ sortValue: '2026-01-01T00:00:00.000Z', id: 1.5 }),
      'utf8'
    ).toString('base64url');
    expect(decodeCursor(token)).toBeNull();
  });

  it('rejects a token whose sortValue is not a string', () => {
    const token = Buffer.from(JSON.stringify({ sortValue: 123, id: 1 }), 'utf8').toString(
      'base64url'
    );
    expect(decodeCursor(token)).toBeNull();
  });

  it('produces a URL-safe token (no +, /, or = characters)', () => {
    const token = encodeCursor({ sortValue: '2026-03-15T10:00:00.000+02:00', id: 999999 });
    expect(token).not.toMatch(/[+/=]/);
  });
});
