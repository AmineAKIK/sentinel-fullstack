import { isDigitsOnly } from '../identifiers';

describe('isDigitsOnly', () => {
  it('accepte les chiffres ASCII et conserve la notion de chaîne', () => {
    expect(isDigitsOnly('0012')).toBe(true);
  });

  it.each(['', '12A', '12-3', '１２３'])('refuse %p', (value) => {
    expect(isDigitsOnly(value)).toBe(false);
  });
});
