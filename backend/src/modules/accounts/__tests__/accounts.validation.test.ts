import { createAccountSchema, updateAccountSchema } from '../accounts.validation';

const validAccount = {
  firstName: 'Alice',
  lastName: 'Martin',
  badgeNumber: '0012',
  role: 'OPERATOR',
};

describe('account identifier validation', () => {
  it('accepte un badge numérique et conserve ses zéros initiaux', () => {
    const result = createAccountSchema.safeParse(validAccount);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.badgeNumber).toBe('0012');
  });

  it.each(['B012', '01-2', '０１２'])('refuse le badge non numérique %p', (badgeNumber) => {
    expect(createAccountSchema.safeParse({ ...validAccount, badgeNumber }).success).toBe(false);
    expect(updateAccountSchema.safeParse({ badgeNumber }).success).toBe(false);
  });
});
