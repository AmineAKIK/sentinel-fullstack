import { signAuthToken, verifyAuthToken } from '../jwt';
import { isAdminSessionPayload } from '../sessionPayloads';

const originalSecret = process.env.JWT_SECRET;

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-jwt-tests';
});

afterAll(() => {
  if (originalSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalSecret;
});

it('signs a scoped token that validates only for its intended audience', () => {
  const token = signAuthToken({ adminId: 1, username: 'admin', sessionVersion: 2 }, 1, 'admin');

  expect(token).not.toBeNull();
  const payload = verifyAuthToken(token!, 'admin');
  expect(isAdminSessionPayload(payload)).toBe(true);
  expect(() => verifyAuthToken(token!, 'workshop')).toThrow();
});

it('does not sign when the server secret is unavailable', () => {
  const current = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  expect(signAuthToken({}, 1, 'admin')).toBeNull();
  process.env.JWT_SECRET = current;
});
