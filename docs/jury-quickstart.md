# Sentinel — prise en main depuis un clone neuf

Ce parcours installe une instance **locale indépendante**. Aucun secret, compte,
VPS ou service payant de l'auteur n'est nécessaire. Ne pas brancher les tests ou
les seeds sur la production. Les exemples utilisent une base locale, jamais un
dump de production. SMTP et l'assistance IA sont optionnels : sans configuration,
ces intégrations ne sont pas disponibles ; les parcours métier restent locaux.

## 1. Prérequis et version examinée

- Git, Node.js **24.18.0**, npm **11.16.0** (versions de référence de la CI).
- PostgreSQL **15** installé et démarré ; accès à son outil `psql` ou pgAdmin
  avec un compte capable de créer un rôle et des bases locales.
- Ports locaux libres : `3000` et `5173` pour le développement ; `3100`, `5174`
  et `5175` pour les tests navigateur. PostgreSQL utilise ici `5432`.
- Connexion Internet pour télécharger les dépendances et Chromium.

Depuis PowerShell ou Bash :

```text
git clone https://github.com/AmineAKIK/sentinel-fullstack.git
cd sentinel-fullstack
git rev-parse HEAD
node --version
npm --version
npm --prefix backend ci
npm --prefix frontend ci
```

Conserver le SHA affiché avec les résultats des tests. Le tag produit immuable
`v1.0.0-rc.9` pointe sur `ed26a25e3c005cabb0da30a4553dfbbee03afe81`.
Le présent guide et les corrections de portabilité peuvent être postérieurs :
un clone de la branche par défaut n'est pas nécessairement identique au tag.
Ne pas faire un clone superficiel (`--depth`) pour la suite d'intégration :
elle vérifie aussi les migrations historiques du tag `v1.0.0-rc.2`.

Sous Windows, `.gitattributes` impose LF aux fichiers texte : ne pas convertir
manuellement les migrations SQL ou les lockfiles en CRLF. Leurs octets font
partie des contrôles d'intégrité.

## 2. Créer les bases locales

Dans **psql connecté à votre PostgreSQL local comme administrateur**, exécuter :

```sql
CREATE ROLE sentinel LOGIN;
\password sentinel
CREATE DATABASE sentinel OWNER sentinel;
CREATE DATABASE sentinel_test OWNER sentinel;
CREATE DATABASE sentinel_e2e OWNER sentinel;
```

`\password` est une commande psql : elle demande un mot de passe sans l'inclure
dans cette documentation. Avec pgAdmin, créer le rôle de connexion et les trois
bases via son interface. Si le rôle existe déjà, ne pas le recréer ni changer
son mot de passe sans vérifier son usage. Les noms `_test` et `_e2e` sont des
garde-fous obligatoires ; ces bases sont réservées aux tests qui en réinitialisent
les données. Le rôle doit être propriétaire des bases de test.

## 3. Configurer l'instance de développement

Depuis la racine, dans PowerShell :

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Ou dans Bash (Linux/macOS/Git Bash) :

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Sur une installation existante, **ne pas écraser les `.env`**. Éditer
`backend/.env` avec ses propres valeurs locales :

- `DATABASE_URL=postgres://sentinel:MOT_DE_PASSE@localhost:5432/sentinel` ;
  encoder les caractères réservés du mot de passe dans l'URL (`@`, `:`, `#`, etc.).
- `ADMIN_USERNAME` : identifiant administrateur choisi, non purement numérique.
- `ADMIN_PASSWORD` : mot de passe choisi, au moins 12 caractères (72 octets maximum).
- `JWT_SECRET` et `COOKIE_SECRET` : deux valeurs aléatoires différentes.
- `BOARD_ACCESS_CODE_HASH` : hash bcrypt du code Board choisi (voir ci-dessous).
- Garder `NODE_ENV=development`, `PORT=3000`, `CLIENT_ORIGIN=http://localhost:5173`
  et `TRUST_PROXY=false` pour ce parcours strictement local.

Générer chaque secret séparément (commande commune aux deux shells) :

```text
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Générer le hash Board (code local d'au moins 6 caractères), depuis la racine :

```powershell
$env:BOARD_ACCESS_CODE = 'votre-code-local'
npm --prefix backend run hash:board
Remove-Item Env:BOARD_ACCESS_CODE
```

Ou en Bash :

```bash
BOARD_ACCESS_CODE='votre-code-local' npm --prefix backend run hash:board
```

Reporter **uniquement le hash `$2b$...` affiché** dans `BOARD_ACCESS_CODE_HASH`
de `backend/.env`. Ne jamais committer les `.env`. Le fichier frontend conserve
`VITE_API_URL=http://localhost:3000`. Ne pas mélanger `localhost` et `127.0.0.1`
dans les URL du parcours de développement : l'origine est contrôlée.

## 4. Démarrer et parcourir l'application

Terminal 1, depuis la racine :

```text
npm --prefix backend run migrate
npm --prefix backend run dev
```

Terminal 2, depuis la racine :

```text
npm --prefix frontend run dev
```

Ouvrir `http://localhost:5173`, puis `http://localhost:3000/api/health`.
La base vide est amorcée avec **l'unique administrateur** défini plus haut,
pas avec des données de production. Se connecter à Administration ; créer les
lignes et les comptes métier nécessaires aux parcours Atelier. Le Board utilise
le code dont le hash a été configuré, pas le mot de passe administrateur.
Une instance vide n'affichant aucun incident est un état normal.

Pour le scénario métier et les rôles, consulter [conception.md](conception.md)
et le [jeu d'essai de référence](technique.md). Les fixtures E2E ci-dessous
permettent de tester automatiquement les parcours avec des données synthétiques.
Ne pas lancer `seed:demo` sur une base à conserver : ce script remplace des données.

## 5. Contrôles sans base de données

Les commandes suivantes se lancent depuis la racine, en PowerShell ou Bash :

```text
npm --prefix backend run format:check
npm --prefix backend run lint
npm --prefix backend run typecheck:scripts
npm --prefix backend run build
npm --prefix backend run test:coverage
npm --prefix backend run verify:reliability
npm --prefix frontend run format:check
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:coverage
```

## 6. Tests PostgreSQL réels

Utiliser un **nouveau terminal dédié aux tests**, depuis la racine. Remplacer
`MOT_DE_PASSE` par le mot de passe local encodé dans l'URL.

PowerShell :

```powershell
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgres://sentinel:MOT_DE_PASSE@127.0.0.1:5432/sentinel_test'
npm --prefix backend run test:integration
```

Bash :

```bash
export NODE_ENV=test
export DATABASE_URL='postgres://sentinel:MOT_DE_PASSE@127.0.0.1:5432/sentinel_test'
npm --prefix backend run test:integration
```

La suite prépare elle-même son schéma. Ne pas substituer la base `sentinel`.

## Tests navigateur E2E

Les dépendances des **deux** applications doivent être installées. Depuis la
racine, installer Chromium (sur Linux, utiliser `--with-deps` si les bibliothèques
système ne sont pas présentes ; leur installation peut demander sudo) :

```text
cd frontend
npx playwright install chromium
cd ..
```

PowerShell, dans le terminal de tests :

```powershell
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgres://sentinel:MOT_DE_PASSE@127.0.0.1:5432/sentinel_e2e'
$env:JWT_SECRET = 'local_e2e_only_jwt_secret_at_least_32_chars'
$env:COOKIE_SECRET = 'local_e2e_only_cookie_secret_at_least_32_chars'
$env:CLIENT_ORIGIN = 'http://127.0.0.1:5174'
$env:GLOBAL_API_RATE_LIMIT_MAX = '10000'
npm --prefix frontend run test:e2e
```

Bash :

```bash
export NODE_ENV=test
export DATABASE_URL='postgres://sentinel:MOT_DE_PASSE@127.0.0.1:5432/sentinel_e2e'
export JWT_SECRET='local_e2e_only_jwt_secret_at_least_32_chars'
export COOKIE_SECRET='local_e2e_only_cookie_secret_at_least_32_chars'
export CLIENT_ORIGIN='http://127.0.0.1:5174'
export GLOBAL_API_RATE_LIMIT_MAX=10000
npm --prefix frontend run test:e2e
```

Ces secrets publics sont **exclusivement des fixtures locales de test**, jamais
des valeurs pour une instance accessible sur Internet. Le script refuse une
base dont le nom ne finit pas par `_e2e`, applique les migrations puis recrée
ses fixtures synthétiques. Playwright démarre et arrête ses propres serveurs
sur `3100`, `5174` et `5175`. Un serveur déjà actif sur ces ports provoque un
échec volontaire plutôt que l'utilisation accidentelle d'une autre instance.

Fermer ce terminal après les tests pour ne pas réutiliser ces variables lors
d'un démarrage de développement. En cas d'échec, conserver la sortie et les
répertoires `frontend/test-results` / `frontend/playwright-report`.

## Limites et diagnostic rapide

- `ECONNREFUSED` PostgreSQL : vérifier le service, le port et l'URL locale.
- Erreur d'authentification : vérifier le rôle, son mot de passe et son encodage URL.
- Guard de base : respecter `_test` / `_integration` ou `_e2e`, ne pas contourner.
- Checksum SQL invalide : conserver le message, vérifier les fins de ligne ;
  ne pas modifier le checksum stocké pour masquer une différence.
- Port occupé : arrêter uniquement son propre serveur de développement ou
  libérer le port ; ne pas activer la réutilisation de serveur dans Playwright.
- SMTP/IA non configurés : vérifier les états dégradés documentés, sans attendre
  un e-mail réel ou une réponse d'un fournisseur absent.

Les tests Docker, les scripts Bash d'exploitation et les validations Nginx/Caddy
requièrent un environnement Docker/Linux : voir [production.md](production.md)
et les jobs de [CI](../.github/workflows/ci.yml). Ils ne sont pas nécessaires au
premier lancement Node/PostgreSQL local. Le Compose de production n'est pas un
raccourci de démonstration sans secrets ni HTTPS.
