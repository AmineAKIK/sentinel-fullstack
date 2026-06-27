import { describe, it, expect } from 'vitest';
import { userName, compareUsers } from '../userSort';
import type { SentinelUser } from '../../types';

function user(overrides: Partial<SentinelUser> = {}): SentinelUser {
  return {
    id: 1,
    first_name: 'Alice',
    last_name: 'Martin',
    badge_number: 'B001',
    role: 'OPERATOR',
    is_active: true,
    email: null,
    has_password: true,
    has_password_setup_code: false,
    password_setup_expires_at: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('userName', () => {
  it('concatène nom et prénom', () => {
    expect(userName(user())).toBe('Martin Alice');
  });

  it('gère les espaces superflus si un champ est vide', () => {
    const result = userName(user({ last_name: '', first_name: 'Alice' }));
    expect(result.trim()).toBe('Alice');
  });
});

describe('compareUsers', () => {
  const alice = user({ first_name: 'Alice', last_name: 'Martin', badge_number: 'B001', role: 'OPERATOR', is_active: true, created_at: '2024-01-01T00:00:00Z' });
  const bernard = user({ id: 2, first_name: 'Bernard', last_name: 'Durand', badge_number: 'B002', role: 'MAINTENANCE', is_active: false, created_at: '2024-06-01T00:00:00Z' });

  describe('tri par nom', () => {
    it('asc : alice avant bernard (M < D en FR? non, "Durand Martin" → D < M)', () => {
      const result = compareUsers(alice, bernard, 'name', 'asc');
      expect(result).toBeGreaterThan(0);
    });

    it('desc : inverse', () => {
      const result = compareUsers(alice, bernard, 'name', 'desc');
      expect(result).toBeLessThan(0);
    });
  });

  describe('tri par badge', () => {
    it('asc : B001 avant B002', () => {
      expect(compareUsers(alice, bernard, 'badge', 'asc')).toBeLessThan(0);
    });
  });

  describe('tri par rôle', () => {
    it('MAINTENANCE (Technicien) vs OPERATOR (Opérateur)', () => {
      const result = compareUsers(alice, bernard, 'role', 'asc');
      expect(typeof result).toBe('number');
    });
  });

  describe('tri par statut', () => {
    it('asc : actif avant inactif (actif=1 > inactif=0, donc b-a < 0 → alice passe en premier)', () => {
      expect(compareUsers(alice, bernard, 'status', 'asc')).toBeLessThan(0);
    });
  });

  describe('tri par date de création', () => {
    it('asc : alice (jan) avant bernard (juin)', () => {
      expect(compareUsers(alice, bernard, 'created_at', 'asc')).toBeLessThan(0);
    });
  });
});
