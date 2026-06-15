import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

export default function NotFoundPage() {
  usePageTitle('Page introuvable');

  return (
    <main id="main-content" className="page-container" style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <h1 style={{ fontSize: '4rem', margin: 0 }}>404</h1>
      <p style={{ fontSize: '1.25rem', margin: '1rem 0 2rem' }}>
        Cette page n'existe pas ou n'est plus disponible.
      </p>
      <Link to="/login" className="btn btn-primary">
        Retour à l'accueil
      </Link>
    </main>
  );
}
