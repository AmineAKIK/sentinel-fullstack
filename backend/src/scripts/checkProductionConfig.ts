/**
 * Point d'entrée isolé qui exécute UNIQUEMENT la validation de configuration de
 * production (assertProductionConfig) puis sort — sans démarrer le serveur, sans
 * ouvrir la moindre connexion (la validation est purement locale). Le préflight
 * de déploiement l'invoque dans l'image backend avec l'environnement résolu par
 * `docker compose config`. `assertProductionConfig`, le serveur et la garde CSRF
 * partagent tous `parseClientOrigin`, de sorte que le contrat d'origine est
 * EXACTEMENT celui du démarrage réel — aucune duplication, aucune divergence.
 *
 * NODE_ENV=production est forcé ici : c'est ce contexte que l'on veut valider.
 * Aucune valeur de secret n'est jamais imprimée : seuls les messages d'erreur de
 * la garde (qui ne contiennent que des noms de variables) sortent sur stderr.
 */
process.env.NODE_ENV = 'production';

import { assertProductionConfig } from '../config/production';

try {
  assertProductionConfig();
  process.stdout.write('production config OK\n');
  process.exit(0);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`production config INVALID: ${message}\n`);
  process.exit(1);
}
