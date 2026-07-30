import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import LoginPage from '../../pages/LoginPage';

const MIXED_SLASH_DESTINATIONS = [
  String.raw`\\attacker.example/path`,
  String.raw`\/attacker.example/path`,
  String.raw`/\\attacker.example/path`,
  '//attacker.example/path',
] as const;

const EXPLICIT_EXTERNAL_LINK_DESTINATIONS = [
  ...MIXED_SLASH_DESTINATIONS,
  'https://attacker.example/path',
  'mailto:security@attacker.example',
] as const;

const HOSTILE_NAVIGATION_DESTINATIONS = [
  ...EXPLICIT_EXTERNAL_LINK_DESTINATIONS,
  `${String.fromCharCode(0)}//attacker.example/path`,
  'javascript:alert(1)',
  'data:text/html,attacker',
  `${String.fromCharCode(9)}//attacker.example/path`,
  `${String.fromCharCode(10)}//attacker.example/path`,
  `${String.fromCharCode(13)}//attacker.example/path`,
] as const;

function CurrentLocation() {
  const location = useLocation();
  return (
    <output aria-label="Emplacement courant">{`${location.pathname}${location.search}`}</output>
  );
}

function NavigateButton({ destination }: { destination: string }) {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(destination)}>
      Naviguer
    </button>
  );
}

function HistoryControls() {
  const navigate = useNavigate();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          navigate('/workshop/journal?state=OPEN&q=presse&start=2026-07-01&end=2026-07-29')
        }
      >
        Journal filtré
      </button>
      <button type="button" onClick={() => navigate('/workshop/history?incident=42')}>
        Historique
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Retour
      </button>
      <button type="button" onClick={() => navigate(1)}>
        Avance
      </button>
    </>
  );
}

function expectHistoryToStayOnCurrentOrigin(
  spy: ReturnType<typeof vi.spyOn>,
  origin: string
): void {
  for (const call of spy.mock.calls) {
    const target = call[2];
    if (target === undefined || target === null || target === '') continue;
    expect(new URL(String(target), `${origin}/`).origin).toBe(origin);
  }
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('React Router — destinations hostiles et navigation interne', () => {
  for (const Component of [Link, NavLink]) {
    describe(Component.displayName ?? Component.name, () => {
      for (const destination of EXPLICIT_EXTERNAL_LINK_DESTINATIONS) {
        it(`ne transforme pas ${JSON.stringify(destination)} en navigation SPA externe`, () => {
          window.history.replaceState({}, '', '/login');
          const pushState = vi.spyOn(window.history, 'pushState');
          const preventDocumentNavigation = (event: MouseEvent) => event.preventDefault();
          document.addEventListener('click', preventDocumentNavigation);

          try {
            render(
              <BrowserRouter>
                <Component to={destination}>Destination contrôlée</Component>
              </BrowserRouter>
            );
            pushState.mockClear();

            fireEvent.click(screen.getByRole('link', { name: 'Destination contrôlée' }));

            expect(pushState).not.toHaveBeenCalled();
          } finally {
            document.removeEventListener('click', preventDocumentNavigation);
          }
        });
      }

      it('conserve un caractère de contrôle NUL dans un chemin interne à la même origine', () => {
        window.history.replaceState({}, '', '/login');
        const pushState = vi.spyOn(window.history, 'pushState');

        render(
          <BrowserRouter>
            <Component to={`${String.fromCharCode(0)}//attacker.example/path`}>
              Destination contrôlée
            </Component>
          </BrowserRouter>
        );
        pushState.mockClear();

        fireEvent.click(screen.getByRole('link', { name: 'Destination contrôlée' }));

        expect(pushState).toHaveBeenCalledTimes(1);
        expectHistoryToStayOnCurrentOrigin(pushState, window.location.origin);
        expect(window.location.pathname).not.toBe('/login');
      });
    });
  }

  for (const destination of HOSTILE_NAVIGATION_DESTINATIONS) {
    it(`normalise Navigate sans quitter l'origine pour ${JSON.stringify(destination)}`, async () => {
      window.history.replaceState({}, '', '/source');

      render(
        <BrowserRouter>
          <Routes>
            <Route path="/source" element={<Navigate to={destination} replace />} />
            <Route path="*" element={<CurrentLocation />} />
          </Routes>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(window.location.origin).toBe('http://localhost:3000');
        expect(window.location.pathname).not.toContain('\\');
      });
      if ((MIXED_SLASH_DESTINATIONS as readonly string[]).includes(destination)) {
        expect(screen.getByLabelText('Emplacement courant')).toHaveTextContent(
          '/attacker.example/path'
        );
      } else {
        expect(screen.getByLabelText('Emplacement courant').textContent).not.toBe('/source');
      }
    });

    it(`normalise useNavigate sans quitter l'origine pour ${JSON.stringify(destination)}`, async () => {
      window.history.replaceState({}, '', '/source');
      const user = userEvent.setup();

      render(
        <BrowserRouter>
          <NavigateButton destination={destination} />
          <CurrentLocation />
        </BrowserRouter>
      );

      await user.click(screen.getByRole('button', { name: 'Naviguer' }));

      await waitFor(() => {
        expect(window.location.origin).toBe('http://localhost:3000');
        expect(window.location.pathname).not.toContain('\\');
      });
      if ((MIXED_SLASH_DESTINATIONS as readonly string[]).includes(destination)) {
        expect(screen.getByLabelText('Emplacement courant')).toHaveTextContent(
          '/attacker.example/path'
        );
      }
    });
  }

  it('ignore les paramètres de redirection entrants et conserve les vrais liens internes', () => {
    const hostile = String.raw`\\attacker.example/path`;
    const search = new URLSearchParams({
      next: hostile,
      redirect: '//attacker.example/path',
      returnTo: 'https://attacker.example/path',
      returnUrl: 'javascript:alert(1)',
      redirectTo: String.raw`\/attacker.example/path`,
      return_to: String.raw`/\\attacker.example/path`,
      callbackUrl: '//attacker.example/path',
      continue: 'data:text/html,attacker',
      url: `${String.fromCharCode(10)}//attacker.example/path`,
      destination: `${String.fromCharCode(0)}//attacker.example/path`,
    });
    window.history.replaceState({}, '', `/login?${search.toString()}`);

    render(
      <BrowserRouter>
        <LoginPage />
      </BrowserRouter>
    );

    expect(screen.getByRole('link', { name: /Tableau d'atelier/i })).toHaveAttribute(
      'href',
      '/board'
    );
    expect(screen.getByRole('link', { name: /Pilotage interne/i })).toHaveAttribute(
      'href',
      '/admin/login'
    );
    expect(screen.getByRole('link', { name: /Flux d'atelier/i })).toHaveAttribute(
      'href',
      '/workshop/login'
    );
    expect(screen.getByRole('link', { name: 'Confidentialité des données' })).toHaveAttribute(
      'href',
      '/confidentialite'
    );
  });

  it('préserve les routes internes, leurs paramètres et la pile historique', async () => {
    window.history.replaceState({}, '', '/login');
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <HistoryControls />
        <CurrentLocation />
      </BrowserRouter>
    );

    await user.click(screen.getByRole('button', { name: 'Journal filtré' }));
    expect(screen.getByLabelText('Emplacement courant')).toHaveTextContent(
      '/workshop/journal?state=OPEN&q=presse&start=2026-07-01&end=2026-07-29'
    );

    await user.click(screen.getByRole('button', { name: 'Historique' }));
    expect(screen.getByLabelText('Emplacement courant')).toHaveTextContent(
      '/workshop/history?incident=42'
    );

    await user.click(screen.getByRole('button', { name: 'Retour' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Emplacement courant')).toHaveTextContent(
        '/workshop/journal?state=OPEN&q=presse&start=2026-07-01&end=2026-07-29'
      );
    });

    await user.click(screen.getByRole('button', { name: 'Avance' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Emplacement courant')).toHaveTextContent(
        '/workshop/history?incident=42'
      );
    });
  });
});
