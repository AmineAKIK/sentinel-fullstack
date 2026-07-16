import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PrivacyPage from '../PrivacyPage';

describe('PrivacyPage', () => {
  it('documente uniquement les trois cookies réellement déposés par Sentinel', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(screen.getByText('sentinel_admin_token')).toBeInTheDocument();
    expect(screen.getByText('sentinel_workshop_token')).toBeInTheDocument();
    expect(screen.getByText('sentinel_board_token')).toBeInTheDocument();
    expect(screen.queryByText('sentinel_auth_token')).not.toBeInTheDocument();
    expect(screen.queryByText('sentinel_refresh_token')).not.toBeInTheDocument();
    expect(screen.getByText(/n'utilise pas de mécanisme de refresh token/i)).toBeInTheDocument();
  });

  it('informe sur les données transmises lorsque l’assistance DeepSeek est activée', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    );

    expect(
      screen.getByRole('heading', { name: 'Assistance conversationnelle' })
    ).toBeInTheDocument();
    expect(screen.getByText(/transmet à l'API DeepSeek le message saisi/i)).toBeInTheDocument();
    expect(screen.getByText(/dix derniers messages de l'historique/i)).toBeInTheDocument();
    expect(screen.getByText(/n'est consultée ni ajoutée automatiquement/i)).toBeInTheDocument();
    expect(
      screen.getByText(/aucune donnée personnelle, confidentielle ou industrielle/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/transferts internationaux de données/i)).toBeInTheDocument();
  });
});
