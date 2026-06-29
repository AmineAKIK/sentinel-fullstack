import { Link } from 'react-router-dom';
import { usePageTitle } from '../hooks/usePageTitle';

export default function PrivacyPage() {
  usePageTitle('Confidentialité');
  return (
    <main className="login-hub-page" id="main-content">
      <section className="login-hub-shell privacy-shell">
        <header className="privacy-header">
          <h1>Confidentialité des données</h1>
          <p>Politique de traitement des données personnelles au sein de Sentinel.</p>
        </header>

        <div className="privacy-content">
          <h2>Responsable de traitement</h2>
          <p>
            Le traitement des données est opéré par l'administrateur de l'instance Sentinel
            au sein de l'établissement. Pour toute demande relative à vos données, adressez-vous
            directement à l'administrateur via l'espace d'administration.
          </p>

          <h2>Données collectées</h2>
          <p>
            Sentinel traite les données strictement nécessaires au fonctionnement du suivi
            d'atelier : nom, prénom, numéro de badge et, le cas échéant, adresse e-mail
            (utilisée uniquement pour les notifications de réinitialisation de mot de passe).
            Aucune donnée biométrique, de localisation ou de navigation n'est collectée.
          </p>

          <h2>Finalité et base légale</h2>
          <p>
            Ces données servent exclusivement à la traçabilité des interventions de
            production : identification des déclarants, suivi des prises en charge et
            horodatage des clôtures. Le traitement repose sur l'intérêt légitime de
            l'exploitant au titre du pilotage de son activité industrielle.
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
            Conformément au RGPD (articles 15 à 22), vous disposez d'un droit d'accès,
            de rectification, d'effacement et d'opposition. Ces droits s'exercent auprès
            de l'administrateur de l'application, qui dispose des outils nécessaires dans
            l'espace d'administration.
          </p>

          <h2>Cookies</h2>
          <p>
            Sentinel dépose exclusivement des cookies de session strictement nécessaires
            à l'authentification, sans consentement préalable requis :
          </p>
          <ul className="privacy-list">
            <li>
              <strong>sentinel_auth_token</strong> — session administration et atelier
              (HTTP-only, durée de session)
            </li>
            <li>
              <strong>sentinel_refresh_token</strong> — renouvellement silencieux de
              session (HTTP-only, durée étendue)
            </li>
            <li>
              <strong>sentinel_board_token</strong> — accès au tableau d'atelier partagé
              (HTTP-only, durée de session)
            </li>
          </ul>
          <p>Aucun cookie analytique, publicitaire ou tiers n'est déposé.</p>
        </div>

        <footer className="privacy-footer">
          <p className="privacy-update">Mis à jour le 28 juin 2026</p>
          <Link to="/login" className="privacy-back-link">Retour à l'accueil</Link>
        </footer>
      </section>
    </main>
  );
}
