import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LinesPage from '../LinesPage';
import { listLines } from '../../api/lines';
import { ProductionLine } from '../../types';

vi.mock('../../api/lines', () => ({
  listLines: vi.fn(),
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

function line(id: number, lineNumber: string): ProductionLine {
  return {
    id,
    line_number: lineNumber,
    machines: [
      {
        machineId: 'M01',
        brand: 'Fanuc',
        hasDoubleRobot: false,
        robotNumber: 'R01',
        robotHeads: 1,
      },
    ],
    is_active: true,
    created_at: '2026-03-01T10:00:00.000Z',
    updated_at: '2026-03-01T10:00:00.000Z',
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <LinesPage />
    </MemoryRouter>
  );
}

describe('LinesPage — sémantique de tableau (lot 8, A11Y-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne porte plus role="button" sur les lignes du tableau', async () => {
    vi.mocked(listLines).mockResolvedValue([line(1, '117')]);
    renderPage();

    await waitFor(() => expect(screen.getAllByText('117').length).toBeGreaterThan(0));

    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.getAttribute('role')).not.toBe('button');
      expect(row.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('expose un vrai bouton nommé dans la cellule d’action, qui ouvre le détail de la ligne', async () => {
    vi.mocked(listLines).mockResolvedValue([line(1, '117')]);
    renderPage();

    await waitFor(() => expect(screen.getAllByText('117').length).toBeGreaterThan(0));

    const button = document.querySelector(
      'table .row-action-button[aria-label="Voir la ligne 117"]'
    );
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /Ligne 117/i })).toBeInTheDocument()
    );
  });
});
