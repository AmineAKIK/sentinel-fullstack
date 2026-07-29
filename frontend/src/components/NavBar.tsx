import { useNavigate } from 'react-router-dom';
import { useAppAuth } from '../routes/AppAuthContext';
import ResponsiveNavBar, { NavItem } from './ResponsiveNavBar';

const NAV_ITEMS: NavItem[] = [
  { label: 'Accueil', path: '/admin/accueil', match: ['/admin/accueil'] },
  { label: 'Utilisateurs', path: '/admin/users', match: ['/admin/users'] },
  { label: 'Lignes', path: '/admin/lines', match: ['/admin/lines'] },
  { label: 'Journal', path: '/admin/audit', match: ['/admin/audit'] },
  { label: 'Assistance', path: '/admin/support', match: ['/admin/support'] },
  { label: 'Paramètres', path: '/admin/parametres', match: ['/admin/parametres'] },
];

export default function NavBar() {
  const { logout, logoutPending } = useAppAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    if (await logout()) void navigate('/login', { replace: true });
  }

  return (
    <ResponsiveNavBar
      ariaLabel="Navigation administration"
      brandPath="/admin/accueil"
      section="Administration"
      items={NAV_ITEMS}
      actions={
        <button className="nav-logout" onClick={handleLogout} disabled={logoutPending}>
          {logoutPending ? 'Déconnexion…' : 'Déconnexion'}
        </button>
      }
    />
  );
}
