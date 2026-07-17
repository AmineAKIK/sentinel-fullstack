# Jeu d'essai Sentinel

Le dépôt fournit deux jeux complémentaires : fixtures PostgreSQL d'intégration et
seed navigateur Playwright. Ils sont déterministes, isolés par préfixe et réservés
aux bases de test.

## 1. Jeu Playwright

Source : `backend/scripts/seedE2E.ts`.

| Élément | Valeur de test |
| --- | --- |
| Admin | `e2e-admin` |
| Mot de passe admin | `E2eAdminPass!23` |
| Responsable | badge `E2E-RESP` |
| Opérateur | badge `E2E-OPER` |
| Mot de passe Atelier | `E2eWorkshop!23` |
| Ligne | `999` |
| Machine | `E2E-MCH-1`, Panasonic, robot simple, 16 têtes |

Ces secrets sont publics et strictement destinés à une base jetable. Ils ne
doivent jamais être créés en production.

### Données créées

Le seed :

1. crée ou remet à niveau l'admin E2E ;
2. supprime uniquement les anciens incidents/cas/followers/audits de la ligne 999 ;
3. recrée la ligne et sa machine ;
4. crée ou met à niveau l'opérateur et le responsable ;
5. crée un incident `INDISPONIBLE` avec demande d'annulation `ACTIVE` ;
6. crée un incident `DEGRADEE` avec demande de correction `ACTIVE`.

Les demandes passent par les vrais services métier, pas par une insertion SQL qui
contournerait policy, événements ou arbitrage.

### Reproduction

Préparer une base PostgreSQL de test et les deux dépendances npm :

```bash
cd backend
npm ci
export DATABASE_URL=postgres://sentinel:<password>@localhost:5432/sentinel_e2e
npm run guard:e2e
npm run migrate
npm run seed:e2e

cd ../frontend
npm ci
npx playwright install chromium
DATABASE_URL=postgres://sentinel:<password>@localhost:5432/sentinel_e2e \
JWT_SECRET=secret-de-test-assez-long \
COOKIE_SECRET=secret-cookie-de-test-assez-long \
npm run test:e2e
```

Le script frontend rejoue migrations et seed avant Playwright. Sa configuration
réserve les ports backend 3100 et frontend 5174 et refuse de réutiliser un serveur
déjà lancé.

## 2. Parcours navigateur couverts

### Administration des machines

- connexion admin ;
- ouverture de la ligne 999 ;
- modification du numéro de robot simple ;
- confirmation que la sauvegarde persiste ;
- conversion simple vers double robot ;
- validation des champs gauche/droite et persistance.

### Arbitrage mobile d'annulation

Viewport 393 x 851 :

- connexion Responsable ;
- ouverture du cas actif ;
- modale unique contenue dans la fenêtre ;
- aucune scrollbar interne ni overflow horizontal ;
- body verrouillé et boutons de taille bornée ;
- Reporter conserve le cas actif puis place le dossier en haut ;
- réouverture : modale présentée à nouveau ;
- décision d'annulation directe et disparition du cas ouvert.

### Arbitrage mobile de correction

- ouverture de la comparaison actuel/demandé ;
- décision directe depuis la modale ;
- application de la valeur demandée ;
- fermeture du cas d'arbitrage.

## 3. Jeu d'intégration PostgreSQL

Sources : `backend/src/integration/__tests__/`.

Chaque suite utilise ses propres préfixes, applique les 45 migrations et nettoie
uniquement ses fixtures.

### Authentification

- admin et Atelier ;
- mot de passe/setup ;
- compte inactif ;
- version de session ;
- identifiants invalides.

### Comptes

- création/mise à jour ;
- conflits de badge normalisé ;
- contraintes concurrentes ;
- blocage des références actives ;
- audit et anonymisation.

### Lignes

- machine simple/double ;
- payloads invalides ;
- unicité ligne et machine ;
- conflits concurrents ;
- impact et archivage.

### Atelier

- création, prise/transfert, attente, reprise et clôture ;
- annulation et invalidation ;
- permissions par rôle ;
- contraintes SQL ;
- événements ;
- demandes et décisions d'arbitrage.

Exécution :

```bash
cd backend
export DATABASE_URL=postgres://sentinel:<password>@localhost:5432/sentinel_test
npm run test:integration
```

## 4. Cas de validation à présenter

Pour une démonstration jury courte :

1. montrer la ligne/machine dans l'Admin ;
2. se connecter Responsable et afficher la pastille « À arbitrer » ;
3. ouvrir une annulation, expliquer `ACTIVE`, puis Reporter ;
4. rouvrir et décider directement ;
5. ouvrir la correction et comparer actuel/demandé ;
6. montrer le journal et le dossier historisé ;
7. montrer les tests Playwright et PostgreSQL verts sur le même SHA.

Cette séquence démontre référentiel, rôles, workflow, responsive, transaction et
traçabilité sans dépendre d'une donnée manuelle fragile.

## 5. Nettoyage

Le moyen sûr est de supprimer la base de test entière. Le garde-fou refuse le
seed E2E si le nom de base ne se termine pas par `_e2e` ou si
`NODE_ENV=production`. Sur une base de recette partagée explicitement nommée
pour l'E2E, le seed ne touche qu'aux fixtures réservées de la ligne 999.

Ne pas utiliser `docker compose down -v` sur un environnement contenant des
données à conserver.
