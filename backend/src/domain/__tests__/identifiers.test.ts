import {
  isWorkshopIdentifier,
  normalizeAdminUsername,
  numericIdentifierSchema,
} from '../identifiers';

describe('operational identifier contracts', () => {
  const schema = numericIdentifierSchema({ label: 'Le badge', min: 2, max: 8 });

  it('conserve les zéros initiaux d’un identifiant numérique', () => {
    expect(schema.parse(' 0012 ')).toBe('0012');
    expect(isWorkshopIdentifier('0012')).toBe(true);
  });

  it.each(['12A', '12-3', '１２３', ''])('refuse un identifiant non décimal %p', (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('normalise un username admin non numérique', () => {
    expect(normalizeAdminUsername(' jury-admin ')).toBe('jury-admin');
  });

  it.each(['', '   ', '0012'])('refuse le username admin ambigu %p', (value) => {
    expect(() => normalizeAdminUsername(value)).toThrow();
  });

  it('refuse un username admin impossible à saisir dans le client', () => {
    expect(() => normalizeAdminUsername(`admin-${'a'.repeat(80)}`)).toThrow('80 caractères');
  });
});
