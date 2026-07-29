import { useNavigate } from 'react-router-dom';
import { useAppAuth } from '../routes/AppAuthContext';
import ResponsiveNavBar, { NavItem } from './ResponsiveNavBar';

const BASE_NAV_ITEMS: NavItem[] = [
  { label: 'Tableau de bord', path: '/workshop/dashboard', match: ['/workshop/dashboard'] },
  { label: 'Pilotage', path: '/workshop/pilotage', match: ['/workshop/pilotage'] },
  { label: 'Historique', path: '/workshop/history', match: ['/workshop/history'] },
  { label: 'Connaissance', path: '/workshop/knowledge', match: ['/workshop/knowledge'] },
  { label: 'Assistance', path: '/workshop/support', match: ['/workshop/support'] },
];

const JOURNAL_NAV_ITEM: NavItem = {
  label: 'Journal',
  path: '/workshop/journal',
  match: ['/workshop/journal'],
};

export default function WorkshopNavBar() {
  const { session, logout, logoutPending } = useAppAuth();
  const user = session?.accountType === 'workshop' ? session.user : null;
  const navigate = useNavigate();

  const navItems =
    user?.role === 'RESPONSABLE'
      ? [...BASE_NAV_ITEMS.slice(0, 3), JOURNAL_NAV_ITEM, ...BASE_NAV_ITEMS.slice(3)]
      : BASE_NAV_ITEMS;

  async function handleLogout() {
    if (await logout()) void navigate('/login', { replace: true });
  }

  return (
    <ResponsiveNavBar
      ariaLabel="Navigation atelier"
      brandPath="/workshop/dashboard"
      section="Atelier"
      items={navItems}
      actions={
        <>
          {user && (
            <div className="workshop-nav-session">
              <span className="nav-user workshop-nav-user">
                {user.first_name} {user.last_name}
              </span>
              <button
                className="nav-logout workshop-nav-logout"
                onClick={handleLogout}
                disabled={logoutPending}
              >
                {logoutPending ? 'Déconnexion…' : 'Déconnexion'}
              </button>
            </div>
          )}
          {!user && (
            <button className="nav-logout" onClick={() => navigate('/login')}>
              Connexion
            </button>
          )}
        </>
      }
    />
  );
}
