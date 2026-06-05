import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../routes/AuthContext';

const NAV_ITEMS = [
  { label: 'Accueil', path: '/admin/accueil', match: ['/admin/accueil', '/admin/acceuil'] },
  { label: 'Utilisateurs', path: '/admin/users', match: ['/admin/users'] },
  { label: 'Lignes', path: '/admin/lines', match: ['/admin/lines'] },
  { label: 'Journal', path: '/admin/audit', match: ['/admin/audit'] },
  { label: 'Support', path: '/admin/support', match: ['/admin/support'] },
];

export default function NavBar() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleLogout() {
    await logout();
    navigate('/admin/login', { replace: true });
  }

  function isActive(matches: string[]): boolean {
    return matches.some((path) =>
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  }

  return (
    <nav className="nav-bar">
      <div className="nav-left">
        <button className="nav-brand" onClick={() => navigate('/admin/accueil')}>
          SENTINEL
        </button>
        <span className="nav-section">Administration</span>
      </div>
      <div className="nav-links" aria-label="Navigation administration">
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
        <button className="nav-logout" onClick={handleLogout}>
          Déconnexion
        </button>
      </div>
    </nav>
  );
}
