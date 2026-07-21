import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import UserListPage from '../UserListPage';
import { listAccounts } from '../../api/accounts';
import { SentinelUser } from '../../types';

vi.mock('../../api/accounts', () => ({
  listAccounts: vi.fn(),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

vi.mock('../../routes/AppAuthContext', () => ({
  useAppAuth: () => ({
    session: {
      accountType: 'admin',
      user: { id: 1, username: 'admin' },
    },
    loading: false,
    setSession: vi.fn(),
    logout: vi.fn(),
  }),
}));

function user(id: number): SentinelUser {
  return {
    id,
    first_name: 'Jean',
    last_name: 'Dupont',
    badge_number: `B-${id}`,
    role: 'OPERATOR',
    is_active: true,
    has_password: true,
    has_password_setup_code: false,
    password_setup_expires_at: null,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z',
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <UserListPage />
    </MemoryRouter>
  );
}

describe('UserListPage — sémantique de tableau (lot 8, A11Y-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne porte plus role="button" sur les lignes du tableau', async () => {
    vi.mocked(listAccounts).mockResolvedValue([user(1)]);
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Dupont').length).toBeGreaterThan(0));

    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('role')).not.toBe('button');
      expect(row.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('expose un vrai bouton nommé dans la cellule d’action, qui navigue vers la fiche', async () => {
    const navigate = vi.fn();
    vi.mocked(useNavigate).mockReturnValue(navigate);
    vi.mocked(listAccounts).mockResolvedValue([user(42)]);
    renderPage();

    await waitFor(() => expect(screen.getAllByText('Dupont').length).toBeGreaterThan(0));

    const button = document.querySelector(
      'table .row-action-button[aria-label="Voir la fiche utilisateur Jean Dupont"]'
    );
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    expect(navigate).toHaveBeenCalledWith('/admin/users/42');
  });
});
