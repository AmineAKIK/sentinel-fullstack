# Dossiers de décision RC5

État des constats : 29 juillet 2026.

Ce document contient **cinq** dossiers, conformément aux cinq sujets énumérés
dans le contrat RC5, malgré la mention finale « quatre dossiers ». Les sections
1 à 5 conservent intégralement l'état pré-décision : faits reproductibles,
informations externes manquantes et options alors ouvertes. La section 6
enregistre les décisions ensuite données et leur exécution. Elle ne vaut ni
waiver, ni autorisation de publication ou de déploiement.

## Périmètre et preuves conservées

Les constats de dépendances proviennent des sorties brutes du diagnostic au
commit `29db4d1eeb49f5850ce6c5c64dc1dcf5aba78bb2`. Elles sont encore disponibles
dans `/tmp/sentinel-rc5-audit-29db4d1` et dans l'archive récupérable :

```text
/tmp/sentinel-rc5-proof-archives-29db4d1.RHupoE/
  sentinel-rc5-audit-29db4d1.tar.gz
    sha256 674a50bbeb26fadffe95dd159eca5e59eb302e3899c2a539ec0677490b4ff0dd
  sentinel-rc5-frontend-audit.tar.gz
    sha256 d8ae1b8e94f0689084583b5787fc43c149f045f585b60e175f771b05e9930240
```

Les deux preuves dynamiques temporaires ont été exécutées, puis leurs fichiers
de test ont été retirés du dépôt :

```text
/tmp/sentinel-rc5-react-router-dynamic-proof-final.log
  sha256 bd527b565972922dc08aa9980142e30e4ad50355a01c8359b9f45220cf18af83
  résultat 2/2

/tmp/sentinel-rc5-csrf-same-site-dynamic-proof-final.log
  sha256 89b08334fe57b5627cf97b0db0f626a2af3d327647768b858419909f512e42a8
  résultat 2/2
```

Ces preuves locales ne renseignent ni le DNS public, ni le contenu réel du VPS,
ni les paramètres GitHub protégés. Aucun accès à ces systèmes n'a été effectué
pour ce dossier.

## 1. React Router

### 1.1 Alertes officielles au 29 juillet 2026

| Identifiant | Paquet et plage affectée | Version corrigée | Surface annoncée |
| --- | --- | --- | --- |
| [`GHSA-wrjc-x8rr-h8h6`](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6), `CVE-2026-53669` | `react-router >=6.0.0 <7.18.0` | `7.18.0` | redirection externe via des chemins contrôlés contenant notamment des antislashs, transmis à `Link` ou `useNavigate` |
| [`GHSA-337j-9hxr-rhxg`](https://github.com/advisories/GHSA-337j-9hxr-rhxg), `CVE-2026-53666` | `react-router >=6.4.0 <7.18.0` | `7.18.0` | injection de constructeur par `deserializeErrors()` pendant une hydratation SSR manuelle en Framework/Data Mode |
| [`GHSA-jjmj-jmhj-qwj2`](https://github.com/advisories/GHSA-jjmj-jmhj-qwj2), `CVE-2026-53668` | `react-router >=7.9.6 <=7.12.0`; `react-router-dom >=6.30.2 <=6.30.4` | `react-router 7.13.0`; aucune correction publiée dans la ligne `react-router-dom` 6.x | une redirection ouverte déjà présente peut devenir une navigation externe ou un vecteur XSS |

Les trois avis sont de sévérité modérée et ont été publiés le 22 juillet 2026,
puis intégrés ou mis à jour dans la GitHub Advisory Database le 23 juillet
2026. La version v7 qui couvre simultanément les trois bornes est donc
`>=7.18.0`. La documentation officielle consultée le 29 juillet affiche
`7.18.2` comme dernière version de la ligne v7.

### 1.2 Version et audit Sentinel

`frontend/package.json` déclare `react-router-dom: ^6.21.3`. Le lockfile et
`npm ls` résolvent :

```text
react-router-dom@6.30.4
└── react-router@6.30.4
```

La sortie brute de l'audit runtime est :

```text
/tmp/sentinel-rc5-audit-29db4d1/frontend-npm-audit-runtime.json
sha256 46ac94b72c465dd32f76d9bbe5b54fdb0c0ee12130efa2f953e48fd1369e87f9

moderate 2
high     0
critical 0
total    2
```

Les deux nœuds de l'audit sont `react-router` et `react-router-dom`; les trois
advisories sont agrégées dans ces deux nœuds. Il ne s'agit pas de deux
advisories seulement.

### 1.3 Mode et APIs réellement utilisés

Sentinel monte `BrowserRouter` autour de `App` et utilise les deux future flags
v6 `v7_startTransition` et `v7_relativeSplatPath`. C'est le **Declarative Mode**.
Il n'existe en production ni `createBrowserRouter`, ni `RouterProvider`, ni
loader/action de Data Mode, ni SSR, ni hydratation manuelle, ni
`deserializeErrors()`. Deux tests unitaires emploient un `RouterProvider` ou un
`createMemoryRouter`, sans SSR.

Inventaire reproductible dans `frontend/src` :

| Surface | Comptage réel |
| --- | ---: |
| Fichiers important `react-router` ou `react-router-dom` | 51 |
| Fichiers de production | 32 |
| Fichiers de test | 19 |
| Fichiers de production utilisant `useNavigate` | 19 |
| Appels de production `navigate(...)` | 39 |
| Occurrences de production `Link`/`NavLink` | 9 |
| Occurrences de production `Navigate` | 8 |

Les recherches ayant produit ces comptages sont :

```bash
rg -l "from ['\"]react-router(-dom)?['\"]" frontend/src
rg -l '\buseNavigate\b' frontend/src
rg -o '\bnavigate\s*\(' frontend/src --glob '!**/__tests__/**' --glob '!**/*.test.*'
rg -o '<(Link|NavLink)\b' frontend/src --glob '!**/__tests__/**' --glob '!**/*.test.*'
rg -o '<Navigate\b' frontend/src --glob '!**/__tests__/**' --glob '!**/*.test.*'
```

### 1.4 Provenance des destinations

Les `Navigate` des gardes et les `Link` de connexion/confidentialité reçoivent
des chemins littéraux internes. Les éléments de navigation responsive
reçoivent `brandPath` et `items[].path` depuis deux tableaux constants internes.
Les autres destinations dynamiques interpolent des identifiants numériques
issus des objets métier ou des paramètres de filtre construits avec
`URLSearchParams`.

Les paramètres entrants lus dans l'URL sont des identifiants d'incident ou
d'événement et des filtres (`incident`, `event`, `line`, `machine`, `status`,
`state`, `q`, dates, etc.). La recherche n'a trouvé aucun paramètre de type
`next`, `redirect`, `returnTo`, `returnUrl` ou `destination` injecté dans
`Link`, `NavLink`, `Navigate` ou `navigate()`.

Cette absence de source actuellement contrôlable réduit l'exploitabilité dans
Sentinel; elle ne corrige pas les paquets vulnérables et ne protège pas une
future régression de flux de données.

### 1.5 Preuve dynamique locale

Le test temporaire a rendu le vrai `LoginPage` à l'URL contenant
`next=\\attacker.example/x`, puis a cliqué l'espace Tableau : Sentinel a navigué
vers le chemin interne `/board`, sans consommer le paramètre hostile.

Le second cas a donné directement la même valeur hostile à la primitive
`Link` 6.30.4. La propriété URL normalisée de l'ancre résolvait l'origine externe
`http://attacker.example`, ce qui confirme que la primitive installée reste
vulnérable si une destination non fiable lui parvient.

Résultat : `2/2`, log et hash consignés dans la section « Périmètre et preuves ».
Il s'agit d'une preuve JSDOM ciblée, pas d'un test d'exploitation sur le site
public.

### 1.6 Option R1 — migration de sécurité vers la ligne v7

Portée proposée, sans l'appliquer dans cette phase :

1. épingler `react-router-dom` et son `react-router` résolu à `7.18.2` au lieu de
   conserver une plage v6 vulnérable;
2. retirer de `BrowserRouter` les deux flags `v7_*`, devenus le comportement par
   défaut en v7;
3. conserver le Declarative Mode et les imports `react-router-dom` dans cette
   migration de sécurité limitée.

La documentation officielle indique que les applications v6 ayant activé les
future flags peuvent généralement passer à v7 sans rupture. La ligne v7
conserve les réexports `react-router-dom`; leur suppression intervient en v8.
Les suppressions v7 documentées (`json`, `defer`, anciens handlers d'upload,
`fallbackElement` dans certains Data Routers) ne sont pas utilisées par le code
de production Sentinel.

Ampleur attendue :

| Catégorie | Portée |
| --- | --- |
| Fichiers nécessairement modifiés | `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/main.tsx` |
| Fichiers consommateurs à régresser | les 51 fichiers inventoriés, sans réécriture attendue de leurs imports pour v7 |
| Prérequis v7 | Node >=20 et React >=18; Sentinel déclare Node >=24 et React 18.2 |
| Base de données | aucune migration |

Plan de tests si cette option est choisie :

1. `npm ci`, audit complet et audit runtime;
2. Prettier, ESLint, TypeScript, build et tests frontend avec couverture;
3. tests permanents de destinations hostiles sur `Link`, `useNavigate` et les
   pages de connexion;
4. tests des 8 redirections de garde, 9 liens, navigation responsive, routes à
   identifiant et synchronisation URL/historique;
5. E2E Chromium complet sur base fraîche, avec les secrets CI;
6. second build propre et image frontend locale, sans publication.

Rollback : revert atomique des trois fichiers de migration, `npm ci`, puis le
même build et les mêmes tests. Aucun rollback de schéma ou de données n'est
nécessaire.

### 1.7 Option R2 — mesure compensatoire sans migration immédiate

Une mesure compensatoire possible serait de centraliser toute destination non
littérale dans une fonction qui :

- n'accepte qu'un chemin interne commençant par un unique `/`;
- rejette `\`, `//`, tout schéma, toute origine et les caractères de contrôle;
- résout l'URL, puis exige que son `origin` soit celui de la page;
- renvoie une destination interne sûre ou refuse explicitement la navigation.

Elle devrait couvrir chaque futur passage de donnée externe à `Link`,
`NavLink`, `Navigate` et `navigate()`, avec tests permanents de non-régression.
Une CSP ne remplace pas cette validation : elle ne supprime notamment pas le
risque de redirection externe.

| Critère | R1 : v7.18.2 | R2 : validation compensatoire |
| --- | --- | --- |
| Retire les trois alertes du graphe runtime | oui, sous réserve de l'audit vert | non |
| Réduit un futur flux de destination hostile | oui dans la bibliothèque, plus les tests Sentinel | oui dans les seuls appels couverts |
| Étendue de modification | dépendance, lockfile, entrée Router | utilitaire et chaque appel dynamique |
| Risque principal | régression de version majeure | oubli d'un appel et maintien d'une dépendance signalée |
| Waiver requis pour déclarer le risque clos | non si tous les audits/tests sont verts | oui; interdit dans cette phase |

**Décision ouverte R :** choisir R1 ou définir une autre réponse explicite. Ce
dossier ne choisit pas et ne crée pas de waiver.

## 2. Workflow de publication

### 2.1 État prouvé du workflow actuel

`.github/workflows/release.yml` :

- se déclenche sur le glob `v*`, sans validation SemVer stricte;
- accorde globalement `contents: write` et `packages: write`;
- utilise `actions/checkout@v7`, donc un tag mobile et non un SHA complet;
- construit, pousse les deux images et crée la release dans un seul job;
- ne contrôle ni la branche source, ni l'ascendance, ni l'état des six jobs CI;
- ne référence aucun environnement GitHub protégé et aucune approbation;
- ne définit aucune concurrence de publication;
- ne produit ni SBOM, ni attestation de provenance;
- utilise des images de base et outils nommés par tags, sans digest.

Le tag RC4 constitue un précédent distinct : `v1.0.0-rc.4` se résout au merge
commit `da97e5222e0978d9e4af08afe70a08d49a80f4de`, et non à la tête de la branche
RC4 `700b1c183386183b49a22d1a4aac1f7869734f59`.

### 2.2 Contrat commun aux deux politiques

Regex exactes proposées :

```regex
RC     ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.([1-9][0-9]*)$
stable ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$
```

Tout autre tag, y compris `v1`, `v1.0`, `v01.0.0`, `v1.0.0-rc.0`,
`v1.0.0-beta.1` ou un suffixe supplémentaire, doit échouer avant login au
registre, build, push ou création de release.

Dans toutes les règles ci-dessous, `TAG_SHA` désigne le commit pelé du tag,
obtenu par `git rev-parse "${GITHUB_REF}^{commit}"`, jamais le SHA de l'objet tag
annoté.

Pour le SHA candidat exact, les six checks requis sont :

1. `Backend / Quality`;
2. `Frontend / Quality`;
3. `Backend / PostgreSQL integration`;
4. `Browser / Critical journeys`;
5. `Containers / Production contract`;
6. `Ops / Backup and restore drill`.

Le gate doit vérifier les six noms, `headSha == TAG_SHA`,
`status == completed` et `conclusion == success`. Un check absent, neutral,
skipped, cancelled ou rattaché à un autre SHA est un refus.

Le workflow doit être séparé en deux niveaux :

- un job de validation sans secret et avec `contents: read` et `checks: read`;
- un job de publication dépendant du premier, utilisant un environnement
  protégé et seulement les permissions nécessaires :
  `contents: write`, `packages: write`, `id-token: write` et
  `attestations: write`.

Exigences communes :

- environnements `prerelease` pour une RC et `production` pour une stable;
- approbateur requis, auto-approbation interdite et bypass administrateur
  désactivé si le plan GitHub le permet;
- concurrence globale
  `group: release-publish-${{ github.repository }}` avec
  `cancel-in-progress: false`;
- toutes les actions tierces ou GitHub épinglées par SHA complet de 40
  caractères, avec commentaire du tag vérifié;
- politique GitHub « Require actions to be pinned to a full-length commit SHA »;
- images de base et outils (`node`, `nginx`, `postgres`, `caddy`, image
  ShellCheck, etc.) épinglés sous la forme `nom:version@sha256:<digest>`;
- build BuildKit avec provenance maximale et SBOM, attestation des deux digests,
  puis notes de release contenant SHA, digests, liens d'attestation et SBOM;
- aucune publication par tag mutable seul : les notes et le déploiement
  consomment les digests immuables.

Le SHA actuellement pointé par `actions/checkout@v7` a été vérifié dans le dépôt
officiel au 29 juillet 2026 :

```text
actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
```

Tout autre action ajoutée pour Buildx, login, SBOM ou attestation devra être
résolue et revue de la même manière au moment du diff d'implémentation. Les
digests d'images doivent également être résolus et consignés pour
l'architecture exécutée; aucun placeholder de digest ne constitue un workflow
prêt à publier.

### 2.3 Option P1 — RC issue de sa branche release, stable issue de main

Pour `vMAJOR.MINOR.PATCH-rc.N`, la branche dérivée est exactement :

```text
release/vMAJOR.MINOR.PATCH-rcN
```

Le gate P1 doit :

1. capturer les quatre groupes de la regex RC;
2. fetcher la branche distante dérivée et `origin/main`;
3. exiger `TAG_SHA == refs/remotes/origin/release/vMAJOR.MINOR.PATCH-rcN`;
4. exiger
   `git merge-base --is-ancestor "$TAG_SHA" origin/main`, donc que cette tête de
   branche ait déjà été intégrée;
5. exiger les six checks verts sur ce même `TAG_SHA`.

Pour un tag stable, P1 exige :

```text
TAG_SHA == refs/remotes/origin/main
```

et les six checks verts sur ce SHA. Cette politique préserve l'identité de la
branche RC mais diffère du précédent RC4, dont le tag porte le merge commit et
non la tête de branche.

Impact : la release peut référencer le commit de branche testé tout en prouvant
qu'il est contenu dans `main`; le SHA annoncé par la RC n'est cependant pas le
merge commit effectivement en tête de `main`.

### 2.4 Option P2 — RC et stable uniquement à la tête de main

Pour les deux regex, le gate P2 exige :

```text
TAG_SHA == refs/remotes/origin/main
```

puis les six checks verts sur ce SHA. La branche de préparation peut exister,
mais elle n'intervient pas dans l'autorisation de publication.

Impact : le SHA de release est toujours le SHA déployable en tête de `main` et
cette politique correspond au précédent RC4. Elle ne préserve pas dans le tag
l'identité du second parent ou de la tête de la branche RC.

### 2.5 Comparaison et rollback

| Critère | P1 | P2 |
| --- | --- | --- |
| SHA d'une RC | tête exacte de `release/v…-rcN`, déjà ancêtre de `main` | tête exacte de `main` |
| SHA stable | tête exacte de `main` | tête exacte de `main` |
| Correspond au précédent RC4 | non | oui |
| Traçabilité de la branche RC dans le tag | directe | via PR/parents du merge |
| Risque à arbitrer | tag différent du merge déployable | identité de branche RC indirecte |

Le rollback applicatif commun est un redéploiement des **digests de la release
précédente** déjà consignés, après vérification de la compatibilité du schéma et
de la sauvegarde. Un tag publié ne doit pas être déplacé ou réutilisé. Une
publication fautive est gelée et documentée; la correction passe par un nouveau
commit, les six checks et un nouveau tag.

Le rollback du workflow est le revert de son commit de politique, testé sur un
tag factice qui ne dispose d'aucune permission de publication. Il ne justifie
jamais de republier un tag existant.

**Décision ouverte P :** choisir P1 ou P2, confirmer les capacités du plan
GitHub pour les environnements protégés, puis fournir les SHA d'actions et
digests vérifiés dans le diff. Aucun changement de politique n'est effectué ici.

## 3. CSRF same-site

### 3.1 Faits de configuration

- Origine frontend publique documentée et validée par la configuration :
  `https://sentinel.akiksystems.fr`.
- `.github/workflows/ci.yml` utilise
  `https://ci.sentinel.akiksystems.fr` comme valeur de test; cela ne prouve pas
  que ce sous-domaine existe en DNS ou en production.
- Aucun autre sous-domaine réel n'est inventorié dans les fichiers suivis.
- `https://untrusted.sentinel.akiksystems.fr` est une origine sœur
  **hypothétique**, utilisée uniquement par la preuve locale.
- Les cookies Admin, Atelier et Board héritent de `HttpOnly`, `Secure`,
  `signed: true` et `SameSite=Strict` en production. Aucun attribut `Domain`
  n'est défini : les cookies sont host-only.
- Le serveur utilise CORS avec l'origine statique `CLIENT_ORIGIN` et
  `credentials: true`, mais ne valide actuellement ni `Origin`, ni `Referer`, ni
  `Sec-Fetch-Site` comme condition d'exécution d'une mutation et n'utilise pas
  de jeton CSRF.

Un cookie host-only empêche un sous-domaine frère de lire ou poser directement
le cookie de la cible. Il n'empêche pas le navigateur d'envoyer le cookie
existant à la cible lorsque la requête vers celle-ci est considérée
same-site : `SameSite` est fondé sur le domaine enregistrable, pas sur l'origine
complète.

### 3.2 Clients et inconnues externes

Le seul client mutatif trouvé dans le dépôt est le frontend navigateur
`frontend/src/api/client.ts`, qui emploie `credentials: include` et du JSON
lorsqu'un corps existe. Aucun webhook, agent industriel, CLI ou intégrateur
non-navigateur mutatif n'est implémenté dans les fichiers suivis.

Restent inconnus sans inventaire opérationnel :

- tous les enregistrements DNS et propriétaires des sous-domaines
  `*.akiksystems.fr`;
- l'existence d'un sous-domaine délégable, abandonné, compromis ou servi par un
  tiers;
- les scripts externes, clients mobiles, sondes ou outils d'exploitation qui
  mutent l'API;
- la fréquence légitime des requêtes mutatives sans `Origin`, `Referer` ou
  `Sec-Fetch-*`;
- les transformations réelles du Nginx hôte sur ces en-têtes.

### 3.3 Endpoints sans corps ou à corps facultatif

Les POST directement formables sans JSON et produisant un changement sont :

| Endpoint | Corps côté serveur | Effet |
| --- | --- | --- |
| `POST /api/auth/logout` | ignoré | efface les cookies Admin et Atelier |
| `POST /api/board/logout` | ignoré | efface le cookie Board |
| `POST /api/admin/lines/:id/archive` | `force` facultatif, `false` si absent | tente l'archivage d'une ligne sous session Admin |
| `POST /api/workshop/incidents/:id/follow` | ignoré | suit un incident sous session Atelier |
| `POST /api/workshop/incidents/:id/cancel` | `expectArbitration` facultatif | tente l'annulation sous session Atelier |

`POST /api/workshop/incidents/:id/arbitration-consultation` a été examiné mais
n'est pas dans cette liste : le schéma exige un corps JSON
`{requestType: "EDIT"|"CANCEL"}`. Les méthodes PATCH/DELETE restent concernées
par une politique CSRF générale, mais un formulaire HTML simple ne peut pas les
émettre; un fetch cross-origin avec JSON ou méthode non simple déclenche
normalement un preflight CORS.

### 3.4 Preuve dynamique locale

Le test temporaire a monté le vrai middleware CORS, `cookieParser`, le vrai
routeur Lignes et le vrai `adminAuthMiddleware`. Seuls le contrôleur de mutation
et le dépôt de version de session étaient isolés. Après émission d'un cookie
Admin signé, une requête form-urlencoded sans corps a été envoyée vers
`POST /api/admin/lines/42/archive` avec :

```text
Origin: https://untrusted.sentinel.akiksystems.fr
Sec-Fetch-Site: same-site
Cookie: <session Admin signée>
```

Le middleware d'authentification puis le contrôleur de mutation ont été atteints
et la réponse a été `200`. Un second test a fait accepter
`POST /api/auth/logout` depuis la même origine et a observé l'effacement des deux
cookies. Résultat `2/2`; log et hash sont consignés en tête de document.

Le middleware CORS a répondu avec
`Access-Control-Allow-Origin: https://sentinel.akiksystems.fr`, valeur fixe qui
ne correspond pas à l'origine hostile. Le navigateur refuserait donc à
l'attaquant la lecture de la réponse, mais cette différence n'annule pas la
mutation déjà exécutée et une requête HTML simple n'a pas besoin de lire la
réponse.

Limite de la preuve : Supertest a fourni explicitement le cookie et les en-têtes;
il ne simule pas l'algorithme SameSite d'un navigateur réel ni un DNS frère. La
preuve établit que le serveur accepte le chemin forgé. La règle navigateur
same-site et le risque des sous-domaines frères sont documentés par OWASP. Une
preuve bout en bout supplémentaire nécessiterait un domaine frère contrôlé et
une autorisation d'environnement.

### 3.5 Options de protection

#### Option C1 — validation Origin/Referer exacte

Pour toute méthode non sûre authentifiée par cookie :

1. si `Origin` existe, parser l'URL et exiger
   `origin === CLIENT_ORIGIN`;
2. sinon, si `Referer` existe, parser l'URL et exiger la même origine exacte;
3. refuser les valeurs `null`, mal formées, multiples, les suffixes trompeurs et
   toute autre origine;
4. pour les deux en-têtes absents, appliquer la politique explicitement
   décidée : refus immédiat, ou phase temporaire log-only suivie d'un refus;
5. exempter uniquement les endpoints non-navigateur inventoriés, avec une
   authentification propre et des tests dédiés.

Effet : bloque une origine sœur même si `Sec-Fetch-Site` vaut `same-site`.
Risque : casse tout client légitime sans ces en-têtes si aucune exception ou
phase d'observation n'est prévue.

#### Option C2 — jeton CSRF lié à la session

Ajouter un jeton synchronisé ou un double-submit signé par HMAC et lié à la
session, transmis dans un header personnalisé sur toutes les mutations. Le
frontend et chaque client mutatif doivent être adaptés. Le serveur refuse le
jeton absent ou invalide.

Effet : ne dépend pas de la présence de `Origin`/`Referer`; le header personnalisé
empêche aussi le formulaire simple. Risque : plus de code, gestion de cycle de
session et adaptation obligatoire de tous les clients. Un double-submit naïf
non lié à la session est exclu.

#### Option C3 — Fetch Metadata avec fallback

Accepter `same-origin`, traiter `same-site` comme non fiable pour les méthodes
non sûres, refuser `cross-site` et définir précisément les cas `none`. En
l'absence de `Sec-Fetch-*`, utiliser C1 ou C2 comme fallback. Fetch Metadata seul
n'est pas suffisant pour les clients anciens ou non-navigateurs.

### 3.6 Rollout, tests et rollback

Avant enforcement, inventorier en logs structurés les méthodes, routes et
présence des trois familles d'en-têtes, sans journaliser cookie, token ou
payload sensible. La durée et les critères de sortie de cette observation
doivent être décidés.

Tests nécessaires :

- même origine acceptée pour chaque audience et chaque méthode mutative;
- origine sœur, cross-site, `null`, suffixe trompeur et URL mal formée refusés;
- `Origin` absent avec `Referer` valide/invalide;
- deux en-têtes absents selon la politique choisie;
- requêtes CORS preflightées, formulaire simple et client non-navigateur;
- login, logout, archive, follow, cancel et toutes les méthodes PATCH/DELETE;
- test navigateur réel depuis deux origines si un environnement autorisé existe.

Rollback : désactiver uniquement l'enforcement via un réglage explicite et
audité, en conservant l'observation, puis revenir au commit précédent après
analyse. Il ne faut pas élargir silencieusement une allowlist à
`*.akiksystems.fr`.

**Décision ouverte C :** choisir le mécanisme, la politique pour les en-têtes
absents, les éventuelles exceptions et le plan de rollout après inventaire des
clients et sous-domaines. Aucune protection n'est déployée ici.

## 4. Vérité opérationnelle

Le dépôt encode deux topologies valides :

- **A** : Compose racine, Caddy intégré, ports hôte 80/443;
- **B** : base + override host-proxy + override registry, Caddy sous profil non
  activé, backend/frontend liés à deux ports loopback, Nginx hôte pour le TLS.

Le code ne permet pas de déduire laquelle est réellement active sur le VPS.

### 4.1 Contradictions ou ambiguïtés à arbitrer

| Sujet | Texte A | Texte B | Comportement du code | Preuve CI | Inconnu sans production | Recommandation conditionnelle |
| --- | --- | --- | --- | --- | --- | --- |
| Commande publique de déploiement | README : « Le Compose racine décrit la topologie de production », puis `docker compose up -d --build` | Runbook : pour l'instance publique, trois fichiers, images par digest et « jamais de reconstruction locale » | le Compose racine contient bien des `build`; l'override registry fournit des `image@sha256`; `--no-build` est requis par le runbook | CI construit localement pour tester les Dockerfiles et valide les variantes; elle ne prouve pas la commande utilisée sur le VPS | fichiers Compose réellement activés, commande et digests déployés | si l'opérateur confirme B, rendre le runbook autoritatif pour le public et qualifier la commande README de topologie A/local uniquement |
| Architecture nommée « production » | `docs/deploiement-vps.md` ouvre « Architecture de production » par le diagramme Caddy | le même guide dit documenter B pour l'instance publique et présente ensuite Nginx hôte comme « variante » | les deux graphes sont réalisables, selon l'override host-proxy | CI valide la base Caddy et la variante host-proxy | frontal TLS, configuration incluse et version réellement exécutés | après confirmation opérateur, nommer explicitement le premier diagramme « topologie A » et le second « topologie B publique », sans appeler B une simple variante |
| Ports « publiés sur l'hôte » | le guide dit que backend/frontend sont publiés sur `127.0.0.1` en B | quelques lignes plus bas : « seuls les ports 80 et 443 sont publiés sur l'hôte » | l'override publie bien deux ports applicatifs sur l'hôte, mais uniquement en loopback; le pare-feu public n'a besoin que de 80/443 | le test de topologie vérifie les binds loopback | ports loopback choisis et règles pare-feu réelles | distinguer « ports publiés sur l'hôte » de « ports exposés publiquement » : B a deux binds privés loopback et seulement 80/443 publics |
| Exemple registry | commentaire de `docker-compose.registry.example.yml` : exemple à deux fichiers, base + registry | runbook public : B utilise toujours base + host-proxy + registry | l'exemple à deux fichiers conserve Caddy et correspond donc à A; B exige le troisième fichier | CI valide séparément registry et host-proxy, puis leurs invariants | fichier réellement copié sous `docker-compose.registry.yml` et tableau `COMPOSE` utilisé | étiqueter l'exemple à deux fichiers comme A; ajouter un exemple B à trois fichiers sans modifier la procédure publique avant confirmation |

### 4.2 Faits locaux non équivalents à une preuve VPS

La CI peut vérifier :

- interpolation et schéma Compose;
- réseaux internes, profils, binds loopback et références de digest;
- builds des Dockerfiles, utilisateurs non-root et labels OCI;
- syntaxe de l'exemple Nginx dans un conteneur de test;
- préflight, sauvegarde et restauration sur environnements jetables.

Elle ne peut pas prouver :

- la liste des fichiers Compose réellement passés à Docker sur le VPS;
- les ports loopback choisis et les conteneurs en cours;
- la version Nginx hôte, la sortie `nginx -T` et le vhost effectivement inclus;
- les digests backend/frontend et le `BUILD_SHA` déployés;
- la valeur publique de `/api/health.version`;
- DNS, certificat, HSTS et en-têtes HTTPS publics;
- l'état SMTP ou une recette multi-rôle déployée.

### 4.3 Décision et validation attendues

La recommandation n'est applicable qu'après une attestation opérateur en lecture
seule donnant : commande Compose réelle, `docker compose config`, images et
digests, binds, `nginx -T`, version Nginx, DNS/TLS et `/api/health`. Si ces faits
confirment B, le runbook devient la source normative publique et les autres
documents sont alignés sur lui. S'ils confirment A, il faut au contraire
corriger l'affirmation publique Nginx sans modifier le VPS dans cette phase.

Tests du futur diff documentaire : recherche des commandes `--build`/`--no-build`,
des tableaux `COMPOSE`, des mots Caddy/Nginx et des assertions de ports; puis
tests Compose et scripts de topologie existants. Rollback : revert du seul
commit documentaire si l'attestation opérateur contredit le choix.

**Décision ouverte O :** confirmer la topologie réelle et la source normative.
Aucun accès ou changement VPS n'est réalisé ici.

## 5. Dépendances de développement

### 5.1 Sorties brutes et lecture correcte

| Audit brut | SHA-256 | Résultat |
| --- | --- | --- |
| `/tmp/sentinel-rc5-audit-29db4d1/backend-npm-audit-all.json` | `c7a37657016f9190c6ca28c893f5b0e8889d11f9df9791bc75a644ba96de9340` | 20 high, 0 autre; 625 dépendances |
| `/tmp/sentinel-rc5-audit-29db4d1/backend-npm-audit-runtime.json` | `96da43f7b592039b3c1389236a0d4bd6e3f634f69a428839049dd86445f513de` | 0 vulnérabilité |
| `/tmp/sentinel-rc5-audit-29db4d1/frontend-npm-audit-all.json` | `dc7c94764a71ca6056be752d82a8c9b70d59144c2bb86d4227dda4ee6ac2ddef` | 6 high, 2 moderate; 415 dépendances |
| `/tmp/sentinel-rc5-audit-29db4d1/frontend-npm-audit-runtime.json` | `46ac94b72c465dd32f76d9bbe5b54fdb0c0ee12130efa2f953e48fd1369e87f9` | 0 high, 2 moderate Router |

Les 20 nœuds backend et 6 nœuds frontend de niveau high ne représentent pas 26
vulnérabilités indépendantes. Ils propagent tous une seule advisory :
[`GHSA-mh99-v99m-4gvg`](https://github.com/advisories/GHSA-mh99-v99m-4gvg),
`CVE-2026-14257`, publiée le 23 juillet et mise à jour le 24 juillet 2026.

| Paquet | Sévérité | Plage affectée | Version corrigée | Impact officiel |
| --- | --- | --- | --- | --- |
| `brace-expansion` | high, CVSS 7.5 | `<=5.0.7` | `5.0.8` | expansion de groupes sans borne de longueur, épuisement mémoire et crash Node non rattrapable |

L'override existant `brace-expansion@5: 5.0.8` corrige uniquement les instances
de majeure 5. Les instances 1.1.16 et 2.1.2 restent dans la plage officielle
affectée; les qualifier de « déjà corrigées » ou de faux positifs n'est donc pas
factuel.

### 5.2 Chemins backend

| Dépendance directe | Chemin transitif atteint | Usage |
| --- | --- | --- |
| `jest@30.4.2` | `@jest/core@30.4.2` → `@jest/reporters@30.4.1` → `glob@10.5.0` → `minimatch@9.0.9` → `brace-expansion@2.1.2` | découverte/exécution et reporting des tests |
| `ts-jest@29.4.11` | `@jest/transform@30.4.1` → `babel-plugin-istanbul@7.0.1` → `test-exclude@6.0.0` → `minimatch@3.1.5` → `brace-expansion@1.1.16` | transformation TypeScript et couverture |

Le chemin ESLint backend aboutit à `brace-expansion@5.0.8`, corrigé. L'audit
propose notamment `jest@19.0.2` ou `ts-jest@27.0.3` avec changement majeur :
ce sont des downgrades de remédiation calculés par npm, incompatibles avec une
mise à jour maîtrisée de la chaîne Jest 30.

### 5.3 Chemins frontend

| Dépendance directe | Chemin transitif atteint | Usage |
| --- | --- | --- |
| `eslint@9.39.5` | `@eslint/config-array@0.21.2`, `@eslint/eslintrc@3.3.6` ou le lien direct → `minimatch@3.1.5` → `brace-expansion@1.1.16` | lint CI et local |
| `eslint-plugin-jsx-a11y@6.10.2` | `minimatch@3.1.5` → `brace-expansion@1.1.16` | règles d'accessibilité ESLint |

Le chemin `typescript-eslint@8.64.0` aboutit à `brace-expansion@5.0.8`, corrigé.
L'audit propose `eslint@10.8.0` comme changement majeur ou
`eslint-plugin-jsx-a11y@6.4.1` comme downgrade; aucun de ces résultats ne prouve
à lui seul une résolution compatible du graphe frontend.

### 5.4 Scripts d'installation et artefacts

Les versions vulnérables de `brace-expansion` n'ont pas de script lifecycle
`preinstall`, `install` ou `postinstall`. Les scripts d'installation présents
dans les lockfiles sont distincts :

- backend runtime : `bcrypt@6.0.0`, `install: node-gyp-build`;
- backend dev : `unrs-resolver@1.12.2`, `postinstall`;
- `fsevents`, optionnel et spécifique aux plateformes compatibles;
- aucun script d'installation frontend non optionnel.

Le Dockerfile backend réinstalle la production avec `npm ci --omit=dev`; son
audit runtime est nul. Le Dockerfile frontend utilise les dépendances de dev
uniquement dans le builder, puis copie le répertoire statique `dist` dans
Nginx. Les instances high de `brace-expansion` ne sont donc pas expédiées dans
les deux images runtime.

Le risque restant porte sur la disponibilité des postes et workers CI/build/test
si une chaîne `glob`/`minimatch` reçoit un motif d'accolades contrôlé par un
attaquant. Les configurations et motifs suivis inspectés sont statiques; aucune
entrée applicative distante vers ces outils n'a été trouvée. Un contributeur
capable de modifier les tests, configs ou workflows fait cependant partie du
threat model de la chaîne CI. L'absence dans l'artefact runtime réduit l'impact
produit, mais ne transforme pas la GHSA en faux positif.

### 5.5 Options de traitement

| Option | Action | Compatibilité et preuves requises | Effet |
| --- | --- | --- | --- |
| D1 | attendre une résolution compatible dans les parents Jest/ts-jest/ESLint/jsx-a11y, avec risque dev formellement accepté et daté | propriétaire, échéance, surveillance de lockfile et audit complet à chaque changement | pas de risque de rupture immédiate; high dev reste ouvert |
| D2 | tester dans un commit isolé les mises à jour compatibles des parents dès qu'elles éliminent 1.1.16/2.1.2 | `npm ls`, audit complet/runtime, lint, builds, couvertures, intégration, 156 E2E et images locales | clôture possible sans override inter-majeure |
| D3 | forcer `brace-expansion@5.0.8` sur les anciens chemins | changement de majeure transitive non garanti par les parents; exiger tous les tests de D2 et des tests de glob/lint ciblés | peut supprimer l'alerte, mais risque de casser CommonJS/API/semver; ne pas appliquer sans preuve |

`npm audit fix --force`, les downgrades proposés et une mise à jour massive non
maîtrisée sont exclus. D1 serait une acceptation de risque à décider, pas un
waiver créé par ce document. D2 ou D3 doivent rester atomiques et réversibles :
rollback par revert de `package.json`/lockfile, `npm ci`, puis validations
complètes.

**Décision ouverte D :** choisir le traitement et son échéance. Aucun paquet
n'est mis à jour et aucun waiver n'est créé ici.

## Synthèse des cinq décisions encore nécessaires

| ID | Décision explicite attendue | Information externe préalable |
| --- | --- | --- |
| R | migration Router v7.18.2 ou autre réponse formelle | aucune pour tester R1 localement; décision de risque si R2 |
| P | politique P1 ou P2 et paramètres de protection GitHub | capacités du plan, reviewers, restrictions d'environnements |
| C | mécanisme CSRF, politique sans headers et exceptions | DNS/sous-domaines, clients non-navigateur, observation des headers |
| O | topologie publique réelle et document normatif | état VPS/DNS/Nginx/Compose, sous autorisation séparée |
| D | attente bornée, mise à jour parent compatible ou override testé | calendrier upstream et propriétaire du risque dev |

Tant que ces décisions ne sont pas prises et prouvées, ce dossier ne permet pas
un verdict de publication.

## 6. Décisions appliquées depuis le HEAD RC5

Les mentions « décision ouverte » des sections 1 à 5 sont conservées comme
photographie historique. Le registre ci-dessous est l'état courant et ne
réécrit aucune option rejetée.

| ID | Décision donnée | Résultat local | État de sortie |
| --- | --- | --- | --- |
| R | **R1**, React Router exactement `7.18.2`, Declarative Mode conservé | migration et non-régressions locales vertes | `IMPLEMENTED`, mais publication `BLOCKED` par une advisory high distincte |
| P | **P2**, RC et stable uniquement à la tête exacte de `main` | workflow, garde et dry-run locaux verts | `IMPLEMENTED_LOCAL`, `BLOCKED_EXTERNAL` |
| C | **C1 + C3**, égalité d'origine stricte et refus sans en-têtes | middleware central, inventaire et vrai Chromium verts | `VERIFIED_LOCAL` |
| D | **D2**, parents compatibles uniquement, sans waiver ni override forcé | aucune combinaison parente compatible trouvée | `BLOCKED_UPSTREAM`, aucun commit |
| O | aucune décision opérationnelle autorisée | aucun accès VPS, DNS, Nginx ou Compose distant | `PENDING_AUTHORIZATION` |

### 6.1 R = R1

La migration est portée par :

```text
25a7ca37bc8ddf8f3eefb580b406fa154d1045e6
  fix(security): migrate React Router to patched v7
  parent 3fd8856a773e20cd56b304989a26704d6a1a8f0c

9896551efdf739d973c5d0cc0984d118ce92134d
  fix(frontend): handle async router navigation
  parent 25a7ca37bc8ddf8f3eefb580b406fa154d1045e6
```

`react-router-dom@7.18.2` résout un unique `react-router@7.18.2`; aucune v6 ni
duplication ne subsiste. Les deux future flags v6 ont été retirés. L'application
reste en Declarative Mode : aucun RouterProvider de production, loader/action,
SSR, RSC ou Framework Mode n'a été introduit. Les tests permanents couvrent
antislashs, double slash, schémas et caractères de contrôle, paramètres de
redirection, `Link`, `Navigate`, `NavLink`, `useNavigate`, routes internes,
paramètres et historique.

Preuve ciblée : le test de sécurité échoue avant correction (`9` échecs,
`17` succès), puis passe après correction (`50/50`) :

```text
/tmp/sentinel-rc5-r1-router-red-valid.log
sha256 8adc1ee63a1b812de27a423c98377db1d7978e0b85138ed60f7c3d66a3158b47

/tmp/sentinel-rc5-r1-router-green-final.log
sha256 168bbd5f844e073d3f7ae8be8f34bc4c9765e843afda523fbed0f1d7dd8166a8
```

Les trois advisories qui ont motivé R1 ne sont plus présentes. L'audit courant
révèle toutefois une quatrième advisory, distincte et high,
[`GHSA-qwww-vcr4-c8h2`](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) :
elle couvre `react-router >=7.12.0 <8.3.0`, donc la version imposée `7.18.2`.
L'avis précise que seuls les chemins instables RSC sont concernés; Sentinel
n'utilise pas ces APIs. Cette absence de la surface RSC n'est pas transformée
en waiver : l'audit runtime frontend reste en échec (`2 high`) et le job
`Frontend / Quality` ne peut donc pas être vert tant qu'une nouvelle décision
Router compatible avec ce contrat exact n'est pas donnée.

### 6.2 P = P2

Le commit local est :

```text
ef9dca2f9eaad36b429af18ad45b2952c58207a0
  fix(release): publish only verified main commits
  parent c864ac3a3481e16c0f707d611deebd545725d0ee
```

Le workflow est déclenché manuellement depuis `main`, classe strictement une RC
ou une stable, puis exige :

```text
TAG_SHA == checkout HEAD == refs/remotes/origin/main
```

Il sélectionne par `head_sha` un run `push` de `ci.yml` sur `main`, refuse toute
preuve paginée ou tronquée et exige les six jobs nommés, terminés et réussis sur
ce même SHA. La validation ne possède aucune permission d'écriture et aucun
secret de publication. Après approbation de l'environnement `prerelease` ou
`production`, le garde complet est rejoué avant la réservation d'une draft,
l'authentification GHCR et tout push. Les publications sont sérialisées sans
annulation; actions, outils et images sont épinglés par SHA ou digest; les deux
images reçoivent provenance maximale, SBOM SPDX et attestations; les notes
portent SHA et digests. Aucun tag n'est créé, déplacé ou réutilisé.

Tests permanents :

```text
politique                    10/10
collecteur/dry-run réel       1/1
contrat statique workflow     8/8
```

Les réglages distants indispensables sont détaillés dans
[`github-release-protection-checklist.md`](github-release-protection-checklist.md).
L'état lu sans mutation ne comporte ni environnement, ni ruleset, ni protection
de `main`; les Actions autorisent tout et n'imposent pas les SHA complets. La
publication reste donc `BLOCKED_EXTERNAL`. Cette réserve est renforcée par
l'historique Git : un tag placé sur un ancien commit peut encore charger
l'ancienne version de `release.yml`; seule la combinaison des règles distantes
documentées peut neutraliser ce chemin sans réécrire l'historique interdit.
Enfin, l'audit Router high décrit en 6.1 empêche actuellement d'obtenir les six
jobs verts exigés par P2.

### 6.3 C = C1 + C3

Le commit local est :

```text
c864ac3a3481e16c0f707d611deebd545725d0ee
  fix(security): enforce same-origin mutation requests
  parent 9896551efdf739d973c5d0cc0984d118ce92134d
```

Un middleware placé avant parsing des corps, cookies et routes protège toutes
les méthodes non sûres sous `/api`. Un `Origin` présent a priorité et doit être
unique, bien formé et strictement égal à `CLIENT_ORIGIN`; à défaut, un unique
`Referer` doit parser vers la même origine. L'absence des deux est toujours
refusée. `same-site` n'accorde aucun droit, `cross-site` est refusé,
`same-origin` reste soumis aux contrôles précédents et `none` est tranché par
Origin/Referer. Les méthodes sûres et `OPTIONS` restent lisibles. Les logs ne
contiennent aucun cookie, token ou payload.

L'inventaire permanent exerce les audiences Admin, Atelier et Board, les
méthodes POST/PUT/PATCH/DELETE et 32 routes réelles. Le navigateur réel utilise
deux origines locales (`127.0.0.1:5174` et `127.0.0.1:5175`) : un formulaire
simple depuis l'origine sœur reçoit `403` sans preflight et sans détruire la
session, tandis que les mutations légitimes continuent de passer.

Une revue a en outre identifié le cas de deux lignes `Referer`. La reproduction
intermédiaire, qui lisait seulement `req.headers`, acceptait à tort
`Referer` autorisé suivi d'un `Referer` hostile (`204`). La correction inspecte
`rawHeaders`, refuse toute multiplicité et le même test permanent passe :

```text
backend rouge                    22 échecs / 43 succès
Chromium rouge                   403 attendu, 200 reçu
backend vert                     71/71
Chromium ciblé vert               1/1
double Referer rouge             204 reçu, 403 attendu
double Referer vert               1/1
```

### 6.4 D = D2

Les essais ont été réalisés hors du worktree candidat. Aucune tentative n'a été
conservée, aucun lockfile n'a été modifié et aucun commit artificiel n'existe.

| Périmètre | Parents essayés | Résultat |
| --- | --- | --- |
| backend | `jest@30.4.2`, `ts-jest@29.4.12`, `eslint@10.8.0` | `brace-expansion@2.1.3` reste via Jest/glob et `1.1.17` via ts-jest/test-exclude |
| frontend | `eslint@9.39.5`, `eslint@10.8.0`, `eslint-plugin-jsx-a11y@6.10.2` | `brace-expansion@1.1.17` reste; ESLint 10 et jsx-a11y 6.10.2 sont incompatibles par peer dependency |

Il n'existe pas de Jest 31 ni d'eslint-plugin-jsx-a11y 7 publié dans les
combinaisons officiellement compatibles testées. Le graphe courant conserve
donc `1.1.16` et `2.1.2`, tous deux dans la plage `<=5.0.7` de
`GHSA-mh99-v99m-4gvg`. L'audit runtime backend reste nul; les audits complets
remontent `20 high` backend et `8 high` frontend (Brace plus Router). Aucun
`npm audit fix --force`, downgrade, override inter-majeure, suppression d'outil
ou waiver n'a été utilisé. Verdict D2 : `BLOCKED_UPSTREAM`.

### 6.5 O et validation locale

O reste `PENDING_AUTHORIZATION`. Aucun accès VPS, DNS, Nginx, Caddy ou Compose
distant n'a été tenté; les contradictions de la section 4 restent ouvertes.

La validation locale du code courant donne :

| Niveau | Résultat |
| --- | --- |
| backend unitaire + couverture | `604/604`, 51 suites |
| fiabilité backend | `17/17` |
| PostgreSQL jetable | `165/165`, 22 suites |
| frontend + couverture | `754/754`, 71 fichiers |
| Chromium complet sur trois bases fraîches | `156/156` × 3 |
| axe | inclus et vert dans les trois passages |
| audit runtime backend | `0` vulnérabilité |
| audit runtime frontend | `2 high`, Router RSC — bloquant |
| audits complets | backend `20 high`; frontend `8 high` |

Le premier passage Chromium global a révélé une course de focus après échec de
déconnexion (`155/156`). Le test permanent exigeait déjà la restauration exacte
sur le bouton. La correction attend la fin réelle de l'état pending avant de
refocaliser; preuve ciblée `2/2`, frontend `754/754`, puis trois passages
`156/156`. Elle est isolée dans :

```text
81a74173e715043a6d3520276caac184333c2981
  fix(frontend): restore focus after failed logout
  parent ef9dca2f9eaad36b429af18ad45b2952c58207a0
```

Malgré les preuves fonctionnelles vertes, le verdict de publication RC5 reste
`BLOCKED` : contradiction Router `7.18.2`/audit high, D2 sans combinaison
parente disponible, protections GitHub externes absentes et dossier O non
autorisé.

## Sources officielles consultées le 29 juillet 2026

- GitHub Advisory Database :
  [`GHSA-wrjc-x8rr-h8h6`](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6),
  [`GHSA-337j-9hxr-rhxg`](https://github.com/advisories/GHSA-337j-9hxr-rhxg),
  [`GHSA-jjmj-jmhj-qwj2`](https://github.com/advisories/GHSA-jjmj-jmhj-qwj2),
  [`GHSA-qwww-vcr4-c8h2`](https://github.com/advisories/GHSA-qwww-vcr4-c8h2),
  [`GHSA-mh99-v99m-4gvg`](https://github.com/advisories/GHSA-mh99-v99m-4gvg).
- React Router :
  [versions et modes](https://reactrouter.com/home),
  [présentation de la migration v6 vers v7](https://reactrouter.com/blog/home),
  [changelog officiel](https://reactrouter.com/home/changelog),
  [release 7.18.0](https://github.com/remix-run/react-router/releases/tag/react-router%407.18.0).
- GitHub Actions :
  [épinglage obligatoire par SHA complet](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository),
  [environnements et approbations](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments),
  [concurrence](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency),
  [attestations de provenance](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).
- OWASP Cheat Sheet Series :
  [Cross-Site Request Forgery Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
