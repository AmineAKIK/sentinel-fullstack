import { describe, it, expect } from 'vitest';
import { formatAuditEventTarget } from '../labels';
import type { AuditEventTarget } from '../labels';

describe('formatAuditEventTarget', () => {
  it('scope=line → retourne le numéro de ligne', () => {
    const target: AuditEventTarget = { scope: 'line', line_number: 'L03' };
    expect(formatAuditEventTarget(target)).toBe('L03');
  });

  it('scope=line sans numéro → "Ligne supprimée"', () => {
    const target: AuditEventTarget = { scope: 'line', line_number: null };
    expect(formatAuditEventTarget(target)).toBe('Ligne supprimée');
  });

  it('scope=user avec prénom + nom', () => {
    const target: AuditEventTarget = { first_name: 'Alice', last_name: 'Martin' };
    expect(formatAuditEventTarget(target)).toBe('Alice Martin');
  });

  it('scope=user avec badge si includeBadge=true', () => {
    const target: AuditEventTarget = { first_name: 'Alice', last_name: 'Martin', badge_number: 'B001' };
    expect(formatAuditEventTarget(target, true)).toBe('Alice Martin (B001)');
  });

  it('sans prénom ni nom → "Utilisateur"', () => {
    const target: AuditEventTarget = { first_name: null, last_name: null };
    expect(formatAuditEventTarget(target)).toBe('Utilisateur');
  });

  it('includeBadge sans badge → juste le nom', () => {
    const target: AuditEventTarget = { first_name: 'Bob', last_name: 'Smith', badge_number: null };
    expect(formatAuditEventTarget(target, true)).toBe('Bob Smith');
  });
});
