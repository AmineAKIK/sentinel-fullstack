import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

export default function PrivacyPage() {
  usePageTitle('Confidentialité');
  return (
    <main className="login-hub-page" id="main-content">
      <section className="login-hub-shell privacy-shell">
        <header className="login-hub-header">
          <h1>Confidentialité des données</h1>
          <p>Comment Sentinel traite les données personnelles.</p>
        </header>

        <div className="privacy-content">
          <h2>Données traitées</h2>
          <p>
            Sentinel traite uniquement les données nécessaires au suivi des incidents
            d'atelier : nom, prénom et numéro de badge des utilisateurs, ainsi que les
            événements liés aux incidents (déclarations, prises en charge, clôtures).
            Aucune autre donnée personnelle n'est collectée : pas d'adresse e-mail,
            pas de photo, pas de données de localisation.
          </p>

          <h2>Finalité et base légale</h2>
          <p>
            Ces données servent exclusivement à la traçabilité des interventions de
            production : savoir qui a déclaré un incident, qui l'a traité et quand.
            Ce traitement repose sur l'intérêt légitime de l'exploitant de l'atelier
            au titre du suivi de son activité industrielle.
          </p>

          <h2>Durée de conservation</h2>
          <p>
            À la suppression d'un compte, les données personnelles sont immédiatement
            anonymisées : le nom est remplacé par « Utilisateur Supprimé », le badge par
            un identifiant neutre, et les éléments d'authentification sont détruits.
            L'historique des incidents est conservé sous forme anonymisée pour les
            besoins de traçabilité industrielle.
          </p>

          <h2>Vos droits</h2>
          <p>
            Conformément au RGPD, chaque utilisateur peut demander l'accès, la
            rectification ou l'effacement de ses données auprès de l'administrateur
            de l'application, qui dispose des outils nécessaires dans l'espace
            d'administration.
          </p>

          <h2>Cookies</h2>
          <p>
            Sentinel utilise uniquement des cookies de session strictement nécessaires
            à l'authentification (cookies HTTP-only). Aucun cookie de mesure d'audience
            ou de publicité n'est déposé : aucun consentement n'est donc requis.
          </p>
        </div>

        <footer className="privacy-footer">
          <Link to="/login" className="privacy-back-link">← Retour à l'accueil</Link>
        </footer>
      </section>
    </main>
  );
}
