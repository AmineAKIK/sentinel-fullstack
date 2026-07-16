import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';

export default function LoginPage() {
  usePageTitle('Accueil');
  const [reason, setReason] = useState('');

  useEffect(() => {
    const msg = sessionStorage.getItem('sentinel.login.reason');
    if (msg) {
      setReason(msg);
      sessionStorage.removeItem('sentinel.login.reason');
    }
  }, []);

  return (
    <main className="login-hub-page" id="main-content">
      <section className="login-hub-shell">
        <header className="login-hub-header">
          <h1>Sentinel</h1>
          <p>Votre espace de travail.</p>
        </header>

        {reason && (
          <div className="notice" style={{ marginBottom: 24 }}>
            {reason}
          </div>
        )}

        <div className="login-space-grid" aria-label="Espaces Sentinel">
          <Link to="/board" className="login-space-card login-space-board">
            <span>Tableau</span>
            <div className="login-space-card-body">
              <strong>Tableau d'atelier</strong>
              <p>Vue partagée de l'atelier en temps réel.</p>
            </div>
          </Link>
          <Link to="/admin/login" className="login-space-card">
            <span>Administration</span>
            <div className="login-space-card-body">
              <strong>Pilotage interne</strong>
              <p>Accès, paramètres et supervision opérationnelle.</p>
            </div>
          </Link>
          <Link to="/workshop/login" className="login-space-card">
            <span>Atelier</span>
            <div className="login-space-card-body">
              <strong>Flux d'atelier</strong>
              <p>Incidents, pilotage et suivi en temps réel.</p>
            </div>
          </Link>
        </div>

        <footer className="login-hub-footer">
          <Link to="/confidentialite" className="login-hub-footer-link">
            Confidentialité des données
          </Link>
        </footer>
      </section>
    </main>
  );
}
