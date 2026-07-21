import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import UserDetailPage from '../UserDetailPage';
import { getAccount } from '../../api/accounts';

vi.mock('../../api/accounts', () => ({
  getAccount: vi.fn(),
}));

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

function renderAtUser(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/admin/users/${id}`]}>
      <Routes>
        <Route path="/admin/users/:id" element={<UserDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('UserDetailPage — lien d’évitement toujours ciblable (lot 8, A11Y-04)', () => {
  it('porte #main-content pendant le chargement', () => {
    vi.mocked(getAccount).mockReturnValue(new Promise(() => {}));
    renderAtUser('42');

    expect(document.getElementById('main-content')).not.toBeNull();
  });

  it('porte #main-content quand l’utilisateur est introuvable', async () => {
    vi.mocked(getAccount).mockRejectedValue(new Error('not found'));
    renderAtUser('42');

    await waitFor(() =>
      expect(screen.getByText('Utilisateur introuvable ou accès refusé.')).toBeInTheDocument()
    );
    expect(document.getElementById('main-content')).not.toBeNull();
  });
});
