import jwt from 'jsonwebtoken';
import { signAuthToken, verifyAuthToken } from '../jwt';

// Contrat de la session Board sans expiration automatique (RC3, lot 3) : la
// valeur interne 0 est traduite en 'unlimited' par le service, ce qui doit
// produire un JWT SANS `exp`. Une durée numérique produit au contraire un JWT
// avec `exp`. La révocation reste assurée hors JWT (board_session_version).

const originalSecret = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-jwt-tests';
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

function decode(token: string): jwt.JwtPayload {
  return jwt.decode(token) as jwt.JwtPayload;
}

describe('session Board sans expiration automatique (lot 3)', () => {
  it("une session 'unlimited' produit un JWT sans exp mais reste vérifiable", () => {
    const token = signAuthToken({ label: 'Atelier', boardSessionVersion: 3 }, 'unlimited', 'board');
    expect(token).not.toBeNull();

    const decoded = decode(token!);
    expect(decoded.exp).toBeUndefined();
    expect(decoded.boardSessionVersion).toBe(3);

    // Le token reste valide pour son audience (aucune expiration ne le rejette).
    const verified = verifyAuthToken(token!, 'board') as jwt.JwtPayload;
    expect(verified.boardSessionVersion).toBe(3);
  });

  it('une durée numérique produit un JWT avec exp (expiration automatique)', () => {
    const token = signAuthToken({ label: 'Atelier', boardSessionVersion: 1 }, 12, 'board');
    expect(token).not.toBeNull();

    const decoded = decode(token!);
    expect(typeof decoded.exp).toBe('number');
    expect(typeof decoded.iat).toBe('number');
    // 12 heures = 43200 s.
    expect(decoded.exp! - decoded.iat!).toBe(12 * 3600);
  });
});
