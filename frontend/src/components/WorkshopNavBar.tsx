import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkshopAuth } from '../routes/WorkshopAuthContext';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/workshop/dashboard', match: ['/workshop/dashboard'] },
  { label: 'Pilotage', path: '/workshop/pilotage', match: ['/workshop/pilotage'] },
  { label: 'Historique', path: '/workshop/history', match: ['/workshop/history'] },
  { label: 'Connaissance', path: '/workshop/knowledge', match: ['/workshop/knowledge'] },
  { label: 'Affichage', path: '/workshop/board', match: ['/workshop/board'] },
  { label: 'Support', path: '/workshop/support', match: ['/workshop/support'] },
];

export default function WorkshopNavBar() {
  const { user, logout } = useWorkshopAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate('/workshop', { replace: true });
  }

  function isActive(matches: string[]): boolean {
    return matches.some((path) =>
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  }

  return (
    <nav className="nav-bar">
      <div className="nav-left">
        <button className="nav-brand" onClick={() => navigate('/workshop/dashboard')}>
          SENTINEL
        </button>
        <span className="nav-section">Atelier</span>
      </div>
      <div className="nav-links" aria-label="Navigation atelier">
        {NAV_ITEMS.map((item) => (
          (() => {
            const active = isActive(item.match);
            return (
              <button
                key={item.path}
                className={`nav-link ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </button>
            );
          })()
        ))}
      </div>
      <div className="nav-actions">
        {user && (
          <span className="nav-user">
            {user.first_name} {user.last_name}
          </span>
        )}
        {user ? (
          <button className="nav-logout" onClick={handleLogout}>
            Déconnexion
          </button>
        ) : (
          <button className="nav-logout" onClick={() => navigate('/workshop')}>
            Connexion
          </button>
        )}
      </div>
    </nav>
  );
}
