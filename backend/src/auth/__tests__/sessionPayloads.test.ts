import {
  isAdminSessionPayload,
  isBoardSessionPayload,
  isWorkshopSessionPayload,
} from '../sessionPayloads';

describe('session payload validation', () => {
  it('accepts complete scoped payloads', () => {
    expect(
      isAdminSessionPayload({
        scope: 'admin',
        adminId: 1,
        username: 'admin',
        sessionVersion: 2,
      })
    ).toBe(true);
    expect(
      isWorkshopSessionPayload({
        scope: 'workshop',
        userId: 3,
        badgeNumber: 'B003',
        role: 'MAINTENANCE',
        sessionVersion: 4,
      })
    ).toBe(true);
    expect(
      isBoardSessionPayload({
        scope: 'board',
        label: 'Board atelier',
        boardSessionVersion: 1,
      })
    ).toBe(true);
  });

  it('rejects legacy, malformed and cross-scope payloads', () => {
    expect(isAdminSessionPayload({ adminId: 1, username: 'admin' })).toBe(false);
    expect(
      isAdminSessionPayload({
        scope: 'workshop',
        adminId: 1,
        username: 'admin',
        sessionVersion: 1,
      })
    ).toBe(false);
    expect(
      isWorkshopSessionPayload({
        scope: 'workshop',
        userId: 3,
        badgeNumber: 'B003',
        role: 'ADMIN',
        sessionVersion: 1,
      })
    ).toBe(false);
    expect(isBoardSessionPayload({ scope: 'board', label: '', boardSessionVersion: -1 })).toBe(
      false
    );
  });
});
