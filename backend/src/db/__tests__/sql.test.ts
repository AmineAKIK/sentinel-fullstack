import { boundedInt, parseOptionalInt } from '../sql';

describe('boundedInt', () => {
  it('parses a numeric string within bounds', () => {
    expect(boundedInt('50', 200, 1, 500)).toBe(50);
  });

  it('accepts a plain number, not only a string (lot 7 regression)', () => {
    // Query params HTTP arrivent toujours en string, mais des appelants
    // internes (tests, autres services) peuvent légitimement passer un
    // number — la fonction doit se comporter identiquement dans les deux cas.
    expect(boundedInt(1, 200, 1, 500)).toBe(1);
    expect(boundedInt(2, 200, 1, 500)).toBe(2);
  });

  it('clamps to max when the value exceeds it', () => {
    expect(boundedInt('9999', 200, 1, 500)).toBe(500);
    expect(boundedInt(9999, 200, 1, 500)).toBe(500);
  });

  it('clamps to min when the value is below it', () => {
    expect(boundedInt('0', 200, 1, 500)).toBe(1);
    expect(boundedInt(0, 200, 1, 500)).toBe(1);
  });

  it('falls back to defaultValue for undefined, empty, or non-numeric input', () => {
    expect(boundedInt(undefined, 200, 1, 500)).toBe(200);
    expect(boundedInt('', 200, 1, 500)).toBe(200);
    expect(boundedInt('not-a-number', 200, 1, 500)).toBe(200);
  });
});

describe('parseOptionalInt', () => {
  it('parses both string and number input identically', () => {
    expect(parseOptionalInt('42')).toBe(42);
    expect(parseOptionalInt(42)).toBe(42);
  });

  it('returns null for falsy or non-numeric input', () => {
    expect(parseOptionalInt(undefined)).toBeNull();
    expect(parseOptionalInt('')).toBeNull();
    expect(parseOptionalInt('abc')).toBeNull();
  });
});
