import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { getAdminNotifPrefs, getAppSettings, getBoardSettings } from '../../api/adminSettings';
import { getAdminEmail } from '../../api/adminSecurity';
import { MutationFeedbackProvider } from '../../components/ui/MutationFeedback';
import AdminSettingsPage from '../AdminSettingsPage';

vi.mock('../../api/adminSecurity', () => ({
  changeAdminPassword: vi.fn(),
  getAdminEmail: vi.fn(),
  updateAdminEmail: vi.fn(),
}));

vi.mock('../../api/adminSettings', () => ({
  getAdminNotifPrefs: vi.fn(),
  patchAdminNotifPrefs: vi.fn(),
  getBoardSettings: vi.fn(),
  patchBoardEnabled: vi.fn(),
  patchBoardCode: vi.fn(),
  getAppSettings: vi.fn(),
  patchAppSettings: vi.fn(),
}));

vi.mock('../../routes/AppAuthContext', () => ({
  useAppAuth: () => ({
    session: {
      accountType: 'admin',
      user: { id: 1, username: 'admin' },
    },
    loading: false,
    logout: vi.fn().mockResolvedValue(true),
    logoutPending: false,
  }),
}));

describe('AdminSettingsPage — durée de session Board accessible', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAdminEmail).mockResolvedValue({ hasEmail: false, hint: null });
    vi.mocked(getAdminNotifPrefs).mockResolvedValue({
      notif_admin: true,
      notif_responsables: true,
      notif_techniciens: true,
      notif_operateurs: true,
    });
    vi.mocked(getBoardSettings).mockResolvedValue({ board_enabled: true, hasCode: true });
    vi.mocked(getAppSettings).mockResolvedValue({
      session_duration_hours: 8,
      workshop_session_hours: 8,
      board_session_ttl_hours: 12,
      login_max_attempts: 10,
      setup_code_ttl_hours: 24,
      board_label: 'Board atelier',
    });
  });

  it('conserve le label du champ désactivé après activation réelle du mode sans expiration', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/parametres']}>
        <MutationFeedbackProvider>
          <AdminSettingsPage />
        </MutationFeedbackProvider>
      </MemoryRouter>
    );

    const noExpiry = await screen.findByRole('checkbox', {
      name: 'Session Board sans expiration automatique',
    });
    expect(noExpiry).not.toBeChecked();

    noExpiry.focus();
    await user.keyboard('[Space]');

    expect(noExpiry).toBeChecked();
    expect(noExpiry).toHaveFocus();

    const visibleLabel = screen.getByText('Durée de session — Board atelier', {
      selector: 'label',
    });
    expect(visibleLabel).toHaveAttribute('for', 'boardSessionTtl');

    const ttlInput = document.getElementById(visibleLabel.htmlFor);
    expect(ttlInput).toBeInstanceOf(HTMLInputElement);
    expect(screen.getByRole('textbox', { name: 'Durée de session — Board atelier' })).toBe(
      ttlInput
    );
    expect(ttlInput).toBeDisabled();
    expect(ttlInput).toHaveAccessibleName('Durée de session — Board atelier');
    expect(
      visibleLabel.compareDocumentPosition(ttlInput!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
  });
});
