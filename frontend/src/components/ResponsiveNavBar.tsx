import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

export type NavItem = {
  label: string;
  path: string;
  match: string[];
};

type ResponsiveNavBarProps = {
  ariaLabel: string;
  brandPath: string;
  section: string;
  items: NavItem[];
  actions: ReactNode;
};

export default function ResponsiveNavBar({
  ariaLabel,
  brandPath,
  section,
  items,
  actions,
}: ResponsiveNavBarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const menuId = useId();
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuToggleRef.current?.focus({ preventScroll: true });
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [menuOpen]);

  function isActive(matches: string[]): boolean {
    return matches.some(
      (path) => location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  }

  function navigateTo(path: string) {
    void navigate(path);
  }

  return (
    <nav className={`nav-bar ${menuOpen ? 'is-open' : ''}`} aria-label={ariaLabel}>
      <div className="nav-left">
        <button className="nav-brand" onClick={() => navigateTo(brandPath)}>
          SENTINEL
        </button>
        <span className="nav-section">{section}</span>
      </div>

      <button
        ref={menuToggleRef}
        className="nav-toggle"
        type="button"
        aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-controls={menuId}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      <div className="nav-panel" id={menuId}>
        <div className="nav-links" aria-label={ariaLabel}>
          {items.map((item) => {
            const active = isActive(item.match);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={() => `nav-link ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>
        <div className="nav-actions">{actions}</div>
      </div>
    </nav>
  );
}
