import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import UserForm, { UserFormData } from '../UserForm';

function baseData(overrides: Partial<UserFormData> = {}): UserFormData {
  return {
    firstName: '',
    lastName: '',
    badgeNumber: '',
    role: '',
    ...overrides,
  };
}

function renderForm(overrides: Partial<UserFormData> = {}) {
  const onChange = vi.fn();
  render(<UserForm data={baseData(overrides)} onChange={onChange} />);
  return { onChange };
}

describe('UserForm — rôles attribuables (RC5-8)', () => {
  it('ne propose que les trois rôles humains standards', () => {
    renderForm();

    fireEvent.click(screen.getByRole('combobox', { name: 'Rôle' }));

    expect(screen.getByRole('option', { name: 'Opérateur' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Technicien' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Responsable' })).toBeDefined();
  });

  it('ne propose jamais Administrateur ou Système, même désactivés', () => {
    renderForm();

    fireEvent.click(screen.getByRole('combobox', { name: 'Rôle' }));

    expect(screen.queryByRole('option', { name: 'Administrateur' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Système' })).toBeNull();
    expect(screen.queryByText('Administrateur')).toBeNull();
    expect(screen.queryByText('Système')).toBeNull();
  });

  it('sélectionne un rôle autorisé au clavier (flèches puis Entrée)', () => {
    const { onChange } = renderForm();
    const combobox = screen.getByRole('combobox', { name: 'Rôle' });

    combobox.focus();
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    fireEvent.keyDown(combobox, { key: 'Enter' });

    expect(onChange).toHaveBeenCalledTimes(1);
    const emitted = onChange.mock.calls[0][0] as UserFormData;
    expect(['OPERATOR', 'MAINTENANCE', 'RESPONSABLE']).toContain(emitted.role);
  });

  it('ferme la liste au clavier sans modifier la sélection (Échap)', () => {
    const { onChange } = renderForm();
    const combobox = screen.getByRole('combobox', { name: 'Rôle' });

    combobox.focus();
    fireEvent.keyDown(combobox, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeDefined();

    fireEvent.keyDown(combobox, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("n'envoie jamais de rôle protégé dans onChange, quelle que soit l'option cliquée", () => {
    const { onChange } = renderForm();

    fireEvent.click(screen.getByRole('combobox', { name: 'Rôle' }));
    fireEvent.click(screen.getByRole('option', { name: 'Responsable' }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ role: 'RESPONSABLE' }));
    for (const call of onChange.mock.calls) {
      const data = call[0] as UserFormData;
      expect(['OPERATOR', 'MAINTENANCE', 'RESPONSABLE', '']).toContain(data.role);
    }
  });

  it("reste conforme même quand une valeur protégée préexiste dans l'état du formulaire (édition)", () => {
    // Simule le cas défensif : un state pré-rempli avec une valeur hors
    // contrat (ne devrait jamais arriver en pratique, la base backend est
    // contrainte) — le select ne doit refléter/afficher aucune option de ce
    // type, et rester utilisable pour choisir un rôle valide.
    renderForm({ role: 'ADMIN' as UserFormData['role'] });

    fireEvent.click(screen.getByRole('combobox', { name: 'Rôle' }));

    expect(screen.queryByRole('option', { name: 'Administrateur' })).toBeNull();
    expect(screen.getByRole('option', { name: 'Opérateur' })).toBeDefined();
  });
});
