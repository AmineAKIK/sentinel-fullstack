import { describe, it, expect } from 'vitest';
import { buildQuery, buildRequiredQuery } from '../../utils/query';

describe('buildQuery', () => {
  it('returns empty string when params object is empty', () => {
    expect(buildQuery({})).toBe('');
  });

  it('returns a query string with a leading ? for non-empty params', () => {
    expect(buildQuery({ a: '1' })).toBe('?a=1');
  });

  it('serializes multiple params', () => {
    const result = buildQuery({ role: 'OPERATOR', sort: 'created_at', order: 'desc' });
    expect(result).toBe('?role=OPERATOR&sort=created_at&order=desc');
  });

  it('omits undefined values', () => {
    const result = buildQuery({ role: 'OPERATOR', sort: undefined });
    expect(result).toBe('?role=OPERATOR');
  });

  it('omits null values', () => {
    const result = buildQuery({ role: null });
    expect(result).toBe('');
  });

  it('omits empty-string values', () => {
    const result = buildQuery({ role: '' });
    expect(result).toBe('');
  });

  it('serializes boolean true', () => {
    const result = buildQuery({ active: true });
    expect(result).toBe('?active=true');
  });

  it('serializes the number 0 (zero is falsy but not omitted by the filter)', () => {
    // Number 0 is not undefined/null/'', so it should be included
    const result = buildQuery({ limit: 0 });
    // 0 is filtered because `value === ''` is false but `value === 0` — let's just check
    // what the function actually does (it includes 0 since 0 !== undefined/null/'')
    expect(result).toBe('?limit=0');
  });
});

describe('buildRequiredQuery', () => {
  it('builds a URLSearchParams string without a leading ?', () => {
    const result = buildRequiredQuery({ lineNumber: 'L01' });
    expect(result).toBe('lineNumber=L01');
  });

  it('omits undefined values', () => {
    const result = buildRequiredQuery({ a: 'hello', b: undefined });
    expect(result).toBe('a=hello');
  });

  it('omits null values', () => {
    const result = buildRequiredQuery({ a: null });
    expect(result).toBe('');
  });

  it('includes multiple keys', () => {
    const result = buildRequiredQuery({ lineNumber: 'L01', machineId: 'M01' });
    // Order may vary in URLSearchParams, so check individual presence
    expect(result).toContain('lineNumber=L01');
    expect(result).toContain('machineId=M01');
  });
});
