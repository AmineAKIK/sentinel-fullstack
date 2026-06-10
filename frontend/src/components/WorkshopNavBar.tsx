import { useNavigate } from 'react-router-dom';
import { useAppAuth } from '../routes/AppAuthContext';
import ResponsiveNavBar, { NavItem } from './ResponsiveNavBar';

const NAV_ITEMS: NavItem[] = [
  { label: 'Tableau de bord', path: '/workshop/dashboard', match: ['/workshop/dashboard'] },
  { label: 'Pilotage', path: '/workshop/pilotage', match: ['/workshop/pilotage'] },
  { label: 'Historique', path: '/workshop/history', match: ['/workshop/history'] },
  { label: 'Connaissance', path: '/workshop/knowledge', match: ['/workshop/knowledge'] },
  { label: 'Assistance', path: '/workshop/support', match: ['/workshop/support'] },
];

export default function WorkshopNavBar() {
  const { session, logout } = useAppAuth();
  const user = session?.accountType === 'workshop' ? session.user : null;
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <ResponsiveNavBar
      ariaLabel="Navigation atelier"
      brandPath="/workshop/dashboard"
      section="Atelier"
      items={NAV_ITEMS}
      actions={
        <>
          {user && (
            <div className="workshop-nav-session">
              <span className="nav-user workshop-nav-user">
                {user.first_name} {user.last_name}
              </span>
              <button className="nav-logout workshop-nav-logout" onClick={handleLogout}>
                Déconnexion
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
