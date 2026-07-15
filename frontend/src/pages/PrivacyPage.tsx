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
          <h2>Responsable du traitement</h2>
          <p>
            Le responsable de traitement est l'entreprise ou l'établissement qui exploite
            l'instance Sentinel et en détermine les usages. L'administrateur de l'application
            intervient pour son compte afin de gérer les utilisateurs, les habilitations et les
            paramètres de l'instance. Pour toute question relative à vos données, utilisez le
            canal interne prévu par votre entreprise ou adressez-vous à l'administrateur, qui
            transmettra la demande au service compétent.
          </p>

          <h2>Données collectées</h2>
          <p>
            Sentinel traite les données strictement nécessaires au fonctionnement du suivi
            d'atelier : nom, prénom, numéro de badge professionnel, rôle et, de manière
            facultative, adresse e-mail professionnelle. Le champ e-mail est destiné à recevoir
            une adresse fournie par l'entreprise ; lorsqu'elle permet d'identifier une personne,
            cette adresse reste une donnée personnelle. Les comptes d'administration comportent
            un nom d'utilisateur et peuvent également comporter une adresse e-mail professionnelle.
            Les actions réalisées sur les comptes et les incidents génèrent par ailleurs des traces
            horodatées nécessaires au suivi de l'activité.
          </p>
          <p>
            Sentinel ne collecte aucune donnée biométrique ou de géolocalisation et n'utilise
            aucun dispositif de suivi publicitaire.
          </p>

          <h2>Utilisation des adresses e-mail</h2>
          <p>
            L'adresse e-mail professionnelle d'un compte atelier est facultative. Lorsqu'elle est
            renseignée et que le compte est actif, Sentinel peut l'utiliser pour envoyer les
            notifications opérationnelles correspondant au rôle de la personne ou à son lien avec
            un incident : demande d'arbitrage, urgence, prise en charge, changement de statut,
            consigne ou résultat d'une demande. L'absence d'adresse e-mail n'empêche pas l'accès
            à l'atelier par badge et mot de passe.
          </p>
          <p>
            La réinitialisation d'un mot de passe suit un circuit distinct : la demande d'un
            utilisateur atelier est enregistrée pour être traitée par l'administrateur. Si le canal
            correspondant est activé et qu'une adresse d'administration est configurée, une alerte
            peut également y être envoyée. L'administrateur génère ensuite un nouveau code
            temporaire. L'adresse e-mail facultative du compte atelier n'est pas utilisée comme
            canal de récupération du mot de passe. Aucune adresse n'est utilisée à des fins
            commerciales ou publicitaires.
          </p>

          <h2>Finalité et base légale</h2>
          <p>
            Les données servent à gérer les comptes et les habilitations, sécuriser les accès,
            coordonner le traitement des incidents et assurer la traçabilité des signalements,
            interventions et décisions. Dans le contexte d'une entreprise privée, ce traitement
            peut reposer sur son intérêt légitime à assurer le suivi de production et la
            continuité des interventions, sous réserve qu'elle en documente la nécessité et la
            proportionnalité. Il appartient à l'entreprise responsable de traitement de confirmer
            la base légale applicable à son contexte et de respecter les droits des personnes.
          </p>

          <h2>Destinataires</h2>
          <p>
            Les données de compte sont accessibles aux administrateurs habilités. Les informations
            relatives aux incidents et les notifications associées sont accessibles ou adressées
            uniquement aux utilisateurs autorisés selon leur rôle et leur implication dans
            l'incident. Lorsqu'un service d'envoi d'e-mails est configuré, son prestataire
            technique traite les données strictement nécessaires à l'acheminement des messages
            pour le compte de l'entreprise exploitante. Les données ne sont ni vendues ni utilisées
            à des fins de prospection.
          </p>

          <h2>Assistance conversationnelle</h2>
          <p>
            Lorsque l'assistance externe est activée par la configuration d'une clé API, Sentinel
            transmet à l'API DeepSeek le message saisi, jusqu'aux dix derniers messages de
            l'historique de conversation fourni par le navigateur, ainsi que la documentation
            fonctionnelle statique nécessaire pour répondre aux questions d'utilisation.
          </p>
          <p>
            Aucune donnée opérationnelle de Sentinel — incidents, utilisateurs, lignes, journaux
            ou informations en temps réel — n'est consultée ni ajoutée automatiquement à cette
            requête. Le texte saisi par l'utilisateur est toutefois transmis au prestataire : il ne
            faut donc y renseigner aucune donnée personnelle, confidentielle ou industrielle.
          </p>
          <p>
            Avant d'activer ce service, l'entreprise responsable du traitement doit valider le
            cadre contractuel applicable avec le prestataire, ses conditions de conservation et de
            sécurité, ainsi que la localisation du traitement et, le cas échéant, les garanties
            encadrant les transferts internationaux de données.
          </p>

          <h2>Durée de conservation</h2>
          <p>
            Les données du compte sont conservées tant que l'habilitation est nécessaire. La
            désactivation bloque l'accès et les notifications opérationnelles, sans effacer le
            compte. Lors de sa suppression par un administrateur, le compte opérationnel est
            pseudonymisé : le nom est remplacé par « Utilisateur Supprimé », le badge par un
            identifiant neutre, et l'adresse e-mail ainsi que les éléments d'authentification sont
            supprimés.
          </p>
          <p>
            Pour préserver l'intégrité de la traçabilité industrielle, certains incidents et
            événements d'audit conservent l'identité professionnelle telle qu'elle a été enregistrée
            au moment de l'action. Ces traces historiques restent soumises à un accès restreint et
            à la politique de conservation définie par l'entreprise exploitante. Sentinel
            n'applique actuellement aucun délai de suppression automatique à ces historiques.
          </p>

          <h2>Vos droits</h2>
          <p>
            Conformément au RGPD (articles 15 à 22), vous disposez d'un droit d'accès,
            de rectification, d'effacement, de limitation et d'opposition, dans les conditions
            prévues par les textes. Ces droits s'exercent auprès de l'entreprise responsable de
            traitement, par son canal interne ou par l'intermédiaire de l'administrateur Sentinel.
            Une demande portant sur des traces historiques est examinée au regard des besoins de
            traçabilité et des obligations applicables. Vous pouvez également introduire une
            réclamation auprès de la CNIL sur{' '}
            <a href="https://www.cnil.fr" target="_blank" rel="noreferrer">
              cnil.fr
            </a>.
          </p>

          <h2>Cookies</h2>
          <p>
            Sentinel dépose exclusivement des cookies de session strictement nécessaires
            à l'authentification, sans consentement préalable requis :
          </p>
          <ul className="privacy-list">
            <li>
              <strong>sentinel_admin_token</strong> — session d'administration
              (HTTP-only, durée configurée pour l'administration)
            </li>
            <li>
              <strong>sentinel_workshop_token</strong> — session de l'espace Atelier
              (HTTP-only, durée configurée pour l'atelier)
            </li>
            <li>
              <strong>sentinel_board_token</strong> — accès au tableau d'atelier partagé
              (HTTP-only, durée de session)
            </li>
          </ul>
          <p>
            Sentinel n'utilise pas de mécanisme de refresh token. Aucun cookie analytique,
            publicitaire ou tiers n'est déposé.
          </p>
        </div>

        <footer className="privacy-footer">
          <p className="privacy-update">Mis à jour le 14 juillet 2026</p>
          <Link to="/login" className="privacy-back-link">Retour à l'accueil</Link>
        </footer>
      </section>
    </main>
  );
}
