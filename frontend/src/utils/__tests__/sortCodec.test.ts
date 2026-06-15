import { describe, it, expect } from 'vitest';
import { makeSortCodec } from '../sortCodec';

const entries = [
  { key: 'date-desc', sort: 'date', order: 'desc' },
  { key: 'date-asc', sort: 'date', order: 'asc' },
  { key: 'name-asc', sort: 'name', order: 'asc' },
];

describe('makeSortCodec', () => {
  const codec = makeSortCodec(entries);

  describe('encode', () => {
    it('retourne la clé correspondant à sort+order', () => {
      expect(codec.encode({ sort: 'date', order: 'desc' })).toBe('date-desc');
      expect(codec.encode({ sort: 'name', order: 'asc' })).toBe('name-asc');
    });

    it('retourne la dernière clé pour une combinaison inconnue', () => {
      expect(codec.encode({ sort: 'unknown', order: 'desc' })).toBe('name-asc');
    });
  });

  describe('decode', () => {
    it('retourne sort+order pour une clé connue', () => {
      expect(codec.decode('date-asc')).toEqual({ sort: 'date', order: 'asc' });
    });

    it('retourne la dernière entrée pour une clé inconnue', () => {
      expect(codec.decode('???')).toEqual({ sort: 'name', order: 'asc' });
    });
  });

  it('encode(decode(key)) === key pour toutes les clés connues', () => {
    for (const entry of entries) {
      expect(codec.encode(codec.decode(entry.key))).toBe(entry.key);
    }
  });
});
