import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ResponsiveNavBar, { NavItem } from '../ResponsiveNavBar';

const ITEMS: NavItem[] = [
  { label: 'Accueil', path: '/admin/accueil', match: ['/admin/accueil'] },
  { label: 'Utilisateurs', path: '/admin/users', match: ['/admin/users'] },
];

function renderNav(initialPath = '/admin/accueil') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ResponsiveNavBar
        ariaLabel="Navigation test"
        brandPath="/admin/accueil"
        section="Administration"
        items={ITEMS}
        actions={<button className="nav-logout">Déconnexion</button>}
      />
    </MemoryRouter>
  );
}

describe('ResponsiveNavBar', () => {
  it('marks the active item', () => {
    renderNav('/admin/users');

    expect(screen.getByRole('link', { name: 'Utilisateurs' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('toggles the mobile menu button state', () => {
    renderNav();

    const toggle = screen.getByRole('button', { name: 'Ouvrir le menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Fermer le menu' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('ferme le menu avec la vraie touche Échap et rend le focus au hamburger', async () => {
    const user = userEvent.setup();
    const { container } = renderNav();
    const nav = container.querySelector('.nav-bar');
    const toggle = screen.getByRole('button', { name: 'Ouvrir le menu' });

    await user.click(toggle);
    expect(nav).toHaveClass('is-open');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    await user.tab();
    expect(screen.getByRole('link', { name: 'Accueil' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(nav).not.toHaveClass('is-open');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName('Ouvrir le menu');
    expect(toggle).toHaveFocus();
  });
});
