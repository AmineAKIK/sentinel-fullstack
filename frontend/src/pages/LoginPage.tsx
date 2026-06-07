import { Link } from 'react-router-dom';

export default function LoginPage() {
  return (
    <main className="login-hub-page" id="main-content">
      <section className="login-hub-shell">
        <header className="login-hub-header">
          <h1>Sentinel</h1>
          <p>Votre espace de travail.</p>
        </header>

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
              <p>Gestion des comptes, lignes et journal.</p>
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
      </section>
    </main>
  );
}
