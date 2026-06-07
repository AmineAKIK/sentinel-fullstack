import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

    expect(screen.getByRole('button', { name: 'Utilisateurs' })).toHaveAttribute(
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

  it('closes the mobile menu on Escape', () => {
    renderNav();

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});
