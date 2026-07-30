# Audit final incrémental Sentinel RC5

**Date :** 30 juillet 2026

**Verdict :** `BLOCKED_EXTERNAL`

Les six constats P1 locaux `RC5-AUD-01..06` sont corrigés et disposent chacun
d'un cycle rouge→vert permanent ciblant le comportement constaté. La revue
terminale du delta ne relève aucun risque résiduel local non documenté.

Le seul blocage restant est organisationnel et externe : le dépôt ne possède
ni reviewer indépendant de l'initiateur, ni identité technique dédiée à la
création contrôlée des tags. Ces deux identités ne peuvent pas être remplacées
honnêtement par un seul administrateur.

## 1. Périmètre et couverture

Le registre exhaustif validé au début de la correction terminale couvrait les
`576` chemins du commit
`1a145816b5230bc49e348a25a78730297bb14973`. Un test permanent a été ajouté;
le dépôt suivi comporte maintenant `577` chemins.

| Provenance terminale | Fichiers | Traitement |
| --- | ---: | --- |
| byte-identiques à `1a145816b5230bc49e348a25a78730297bb14973` | `545` | héritage du registre validé par identité de hash |
| modifiés ou ajoutés pendant la correction terminale, documentation finale comprise | `32` | diff, appels directs et tests relus |
| **total courant** | **`577/577`** | **`100 %`** |

Le registre exhaustif est
[`rc5-final-audit-register.tsv`](rc5-final-audit-register.tsv). Chaque chemin
courant y possède son blob, son SHA-256, sa provenance, son statut final et, le
cas échéant, l'identifiant du constat. La ligne du registre lui-même utilise
`SELF_REVIEWED_NO_RECURSIVE_HASH` : intégrer son propre hash rendrait le fichier
récursif et impossible à stabiliser.

## 2. Réutilisation bornée et preuves terminales

La correction terminale modifie le runtime, les tests applicatifs et
`scripts/test-preflight.sh`; leurs anciennes preuves ne sont donc pas héritées.
Les manifestes et lockfiles, Dockerfiles, workflows, migrations `001..050` et
sous-arbres PostgreSQL/restore restent byte-identiques au HEAD terminal de
départ :

| Périmètre hérité | Identité vérifiée |
| --- | --- |
| manifestes et lockfiles, `4` fichiers | SHA-256 agrégé `48b1cbbb9a558607b5c037f89b633b78d9a90629f62e952717c7a2eab3ffe9b0` |
| Dockerfiles et `.dockerignore`, `4` fichiers | SHA-256 agrégé `9aee89281365d60f5a8f1438830674215ba02db9746e4f4cc7636d40011b1edd` |
| workflows GitHub | arbre Git `a04d2fea95cd3bb278b125295261b43514edc93d` |
| migrations `001..050`, sans `051` | arbre Git `10a13718252c65a9e2f8b17f89c562b26c35a9c1`; SHA-256 agrégé `5453a99d974465a667d707567019bb09415509f5172b60d0dc1503649701226` |
| intégration PostgreSQL | arbre Git `0fb5782494b3454c91fdc05981c6cc3ad3b4f6c8` |
| base de données, modules et outillage de test backend | arbres Git `3c0b08f9fe026680cbc9b9c87f4bb141279a1d3a`, `2f2fe6bafc56ff4f2118f11d7cc7728ad79d28c4`, `79030e9687ff6b6ecc15e36a7194ba3f561334b9` |
| contrat backup/restore, `55` fichiers | SHA-256 agrégé `3623393b9aacc9a84df01790e646146444ae2eddbfcfd045181f0775e2d93813` |

Les preuves terminales exécutées sont :

- backend ciblé configuration/CSRF : `146/146`;
- frontend ciblé Journal, dates et accessibilité : `74/74`;
- concurrence Journal : scénario terminal vert cinq fois consécutives;
- E2E des six constats : `6/6` sur chacune de trois bases PostgreSQL fraîches;
- backend global : build vert, `626/626` tests et `17/17` contrôles de
  fiabilité;
- frontend global avec couverture : `787/787`, statements `90,38 %`,
  branches `83,75 %`, fonctions `92,36 %`, lignes `92,63 %`;
- PostgreSQL : `165/165` hérité par identité des sous-arbres concernés;
- restore : `21/21` hérité par identité du périmètre;
- Chromium complet : `161/161` en `5,1` minutes sur une base PostgreSQL fraîche,
  axe inclus, sans retry ni skip;
- préflight réel, images locales reconstruites et registre jetable nettoyé :
  `26/26`;
- audits réels : backend complet/runtime `20/0 high`, frontend
  complet/runtime `8/2 high`; les quatre gardes passent et ne reconnaissent que
  les deux exceptions documentées;
- politique des exceptions `15/15`, ShellCheck, formatage, ESLint, build,
  typecheck et `git diff --check` verts;
- `actionlint` est hérité : l'arbre `.github/workflows` est byte-identique.

Le premier build backend global a été arrêté avant compilation par un ancien
répertoire ignoré `backend/dist` appartenant à `nobody:nogroup`; cet artefact
généré a été supprimé, puis build, couverture et fiabilité ont passé. Les deux
premiers passages frontend ont exposé des erreurs de typage dans les nouvelles
preuves, puis l'inventaire permanent Router passé factuellement de `53` à `54`;
les tests ont été corrigés sans relaxation et la suite globale finale est
entièrement verte.

## 3. Exceptions de dépendances

La politique
[`security/dependency-exceptions.json`](../security/dependency-exceptions.json)
accepte exactement jusqu'au 31 août 2026 :

- `GHSA-qwww-vcr4-c8h2`, `not-applicable` : Router/Router DOM `7.18.2`,
  React 18 et mode déclaratif, sans API ni dépendance RSC;
- `GHSA-mh99-v99m-4gvg`, `upstream-dev-only` : chemins Brace exacts sous
  Jest/ts-jest/ESLint/jsx-a11y, absents du runtime et des images.

Toute dérive de version, mode, surface RSC, lockfile, graphe Brace, import
applicatif, payload d'image, nouvelle GHSA high/critical ou expiration fait
échouer la garde. Aucun override, downgrade ou `npm audit fix --force` n'a été
utilisé.

## 4. Constats P1 corrigés

| ID | État | Cause racine et correction | Commits principaux |
| --- | --- | --- | --- |
| `RC5-AUD-01` | `FIXED` | La validation URL normalisait implicitement le slash final alors que CSRF comparait la valeur brute. `parseClientOrigin()` est la source canonique commune au démarrage, à CORS, CSRF, au préflight et au checker. | `8181b7835d8fd38b01913ed0accc9e1b85a20276` |
| `RC5-AUD-02` | `FIXED` | L'abort d'une suite ne réinitialisait pas atomiquement curseur/chargement et un effet passif autorisait un rendu des anciennes lignes. Génération de requête, abort, reset et signature de portée empêchent toute réponse ou peinture périmée. | `0b46903823a68d9e4a91a0bfcdb7999ebae249b9`, `11443efa7e4eb5d198b2e73d090624e017504c11` |
| `RC5-AUD-03` | `FIXED` | Le constructeur `Date` normalisait les jours impossibles et `get()` masquait les paramètres répétés. Validation civile stricte partagée, cardinalité `getAll()`, suppression par `replace` et bornes locales sûres. | `dbacf3c29f0bb726419ea7ad4cc545ad39c07642`, `8aa53a373bab039bb845a957dfce9355537df29a` |
| `RC5-AUD-04` | `FIXED` | L'erreur Admin était visuelle seulement. Elle possède maintenant `role="alert"`, un identifiant, `aria-invalid`, `aria-describedby` et le focus revient au champ après refus. | `2d192c0657ef25ae5d39107781a9d315d9e96ae0`, `35492c3ba9f822b05e0ba1ed82b5062116912d38` |
| `RC5-AUD-05` | `FIXED` | La branche désactivée du TTL Board omettait l'identifiant visé par le libellé. Les deux branches exposent maintenant `boardSessionTtl`. | `2d192c0657ef25ae5d39107781a9d315d9e96ae0` |
| `RC5-AUD-06` | `FIXED` | Les `aria-label` remplaçaient « Début » et « Fin » par d'autres noms. Ils sont retirés afin que les libellés visibles constituent les noms accessibles. | `2d192c0657ef25ae5d39107781a9d315d9e96ae0`, `35492c3ba9f822b05e0ba1ed82b5062116912d38` |

### RC5-AUD-01

Commande rouge, depuis `backend` :
`npm test -- --runInBand src/config/__tests__/production.test.ts`. Le test
`rejects a trailing slash instead of diverging from the runtime CSRF guard`
attendait une exception `canonical absolute origin` pour
`https://sentinel.akiksystems.fr/`; la validation de production n'en levait
aucune. Sortie : `1` échec et `55` succès. Le fichier responsable était
`backend/src/config/production.ts`.

La correction centralise l'origine absolue canonique et exacte, exige HTTPS en
production, ne permet HTTP qu'en développement/test local explicite et refuse
identifiants, chemin, query, fragment, wildcard, sous-domaines ou ports frères.
Commande verte :
`npm test -- --runInBand src/config/__tests__/production.test.ts src/middlewares/__tests__/csrfProtection.test.ts`,
soit `146/146`. Les tests permanents sont ces deux fichiers,
`security-contracts.spec.ts` et `test-preflight.sh`; l'E2E réel passe dans les
trois passages et le préflight passe `26/26`.

### RC5-AUD-02

Commande rouge, depuis `frontend` :
`npm test -- src/hooks/__tests__/useJournalData.test.ts`. Les tests
`annule une suite et réinitialise atomiquement son état quand un filtre change`
et `annule réellement une suite en vol au démontage sans publier d'erreur`
attendaient respectivement une liste et un curseur vides, puis un
`AbortSignal.aborted` à `true`; les anciennes lignes/curseur restaient présents
et le signal valait `false`. Sortie : `5` échecs et `9` succès. Une seconde
preuve exécutée avec
`npm test -- src/hooks/__tests__/useJournalData.test.ts -t "ne présente jamais les anciennes lignes dans le rendu du nouveau filtre réel"`
attendait `[]` mais recevait l'ancienne ligne : `1` échec et `27` tests ignorés.
Le fichier responsable était `frontend/src/hooks/useJournalData.ts`.

L'annulation seule ne définissait ni identité de suite ni portée du rendu.
Commande verte :
`npm test -- src/hooks/__tests__/useJournalData.test.ts`, soit `28/28`; le test
`ignore la réponse tardive de deux changements rapides et conserve la génération récente`
a ensuite passé cinq fois consécutives avec `-t`. Les tests permanents sont ce
fichier et `journal-filter-alignment.spec.ts`; l'E2E réel passe dans les trois
passages.

### RC5-AUD-03

Commande rouge, depuis `frontend` :
`npm test -- src/hooks/__tests__/useJournalData.test.ts src/utils/__tests__/workshopAnalytics.test.ts`.
Le test paramétré
`refuse $0 sans exception ni normalisation silencieuse` attendait `undefined`;
`invalid` produisait `RangeError: Invalid time value`,
`2026-02-29` devenait `2026-02-28T23:00:00.000Z` et `2026-02-31` devenait
`2026-03-02T23:00:00.000Z` sous `TZ=Europe/Paris`. Les tests de nettoyage URL
attendaient un `replace` sans requête invalide; des paramètres vides, répétés
ou inversés restaient dans l'URL. Sortie : `21` échecs et `23` succès. Les
fichiers responsables étaient `frontend/src/utils/workshopAnalytics.ts` et
`frontend/src/hooks/useJournalData.ts`.

La racine était la construction directe de `Date` et l'usage de
`URLSearchParams.get()`. La même commande passe ensuite `44/44`. Les tests
permanents sont les deux fichiers de test ciblés et
`journal-filter-alignment.spec.ts`; l'E2E hostile, répété et inversé passe dans
les trois passages, avec borne ISO calculée dans le navigateur pour prouver
l'absence de décalage de fuseau.

### RC5-AUD-04

La commande rouge accessibilité commune, depuis `frontend`, était
`npm test -- src/components/__tests__/AdminPasswordConfirmModal.test.tsx src/pages/__tests__/AdminSettingsPage.a11y.test.tsx src/pages/__tests__/WorkshopJournalPage.test.tsx`.
Dans
`associe l’erreur au champ et restaure son focus après un refus activé au clavier`,
le rôle attendu était `alert`, avec `aria-invalid` et une description liée; le
rôle obtenu était `null` et les relations étaient absentes. Le fichier
responsable était `frontend/src/components/AdminPasswordConfirmModal.tsx`. La
sortie rouge commune était `3` échecs et `10` succès dans `3` fichiers.

La commande verte ajoute
`src/pages/__tests__/WorkshopJournalPeriodRemoval.test.tsx` à la commande
rouge : `14/14`. Les tests permanents sont
`AdminPasswordConfirmModal.test.tsx` et
`admin-board-session-revocation.spec.ts`. Vert navigateur : activation réelle
par Entrée, fermeture par la croix, restauration exacte du focus et axe.

### RC5-AUD-05

Dans la même commande rouge,
`conserve le label du champ désactivé après activation réelle du mode sans expiration`
activait réellement le contrôle Board par Espace, attendait la cible
`boardSessionTtl` et obtenait `null`. La branche désactivée de
`frontend/src/pages/AdminSettingsPage.tsx` omettait l'identifiant. La commande
verte accessibilité passe `14/14`. Les tests permanents sont
`AdminSettingsPage.a11y.test.tsx` et
`admin-board-session-revocation.spec.ts`. Vert navigateur : champ correctement
nommé et désactivé, activation par Espace, focus visible et axe.

### RC5-AUD-06

Dans la même commande rouge,
`conserve Début et Fin dans le nom accessible des deux champs visibles`
attendait les noms « Début » et « Fin » mais obtenait « Depuis le » et
« Jusqu'au ». Le fichier responsable était
`frontend/src/pages/WorkshopJournalPage.tsx`. La commande verte accessibilité
passe `14/14`. Les tests permanents sont `WorkshopJournalPage.test.tsx`,
`WorkshopJournalPeriodRemoval.test.tsx` et
`journal-filter-alignment.spec.ts`. Vert navigateur : noms exacts, navigation
clavier réelle, focus visible et axe.

Le premier passage E2E terminal a donné `4/6` : `RC5-AUD-04` utilisait Échap
alors que le parcours annoncé devait vérifier la croix, et `RC5-AUD-06`
supposait à tort que Fin suivait Début d'un seul Tab. Les assertions ont été
corrigées sans changement runtime dans
`35492c3ba9f822b05e0ba1ed82b5062116912d38`, puis les deux preuves ont passé
`2/2` et l'ensemble `6/6 ×3`.

La commande navigateur ciblée réellement exécutée depuis la racine était
`DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh npm --prefix frontend run test:e2e -- e2e/security-contracts.spec.ts e2e/journal-filter-alignment.spec.ts e2e/admin-board-session-revocation.spec.ts --grep 'RC5-AUD-0[1-6]'`.
Elle a été exécutée trois fois et a passé `6/6` sur chacun des trois PostgreSQL
jetables, avec migration, seed, garde de base de test et nettoyage complet à
chaque passage.

Aucun P0, secret réel ou risque résiduel local non documenté n'a été détecté.

Trois réserves P2 n'allongent pas la RC5 : teardown du test Board fragile sous
exécution partielle, assertion responsive Pilotage conditionnelle, et test
unitaire Pilotage intitulé comme un changement de filtre sans réaliser ce
changement. Elles restent au backlog.

## 5. Gouvernance GitHub et observation publique

Les protections disponibles ont été appliquées et relues :

- Actions limitées aux actions GitHub et à `docker/*`, SHA complets obligatoires;
- token de workflow en lecture seule, sans approbation de PR;
- ruleset `main` actif, sans bypass, merge commit seul, une approbation
  indépendante, dernier push approuvé, conversations résolues, six checks
  stricts, suppression et force-push interdits;
- création, modification et suppression des tags `v*` verrouillées sans bypass;
- nouvelles releases immuables.

Le dépôt n'a qu'un collaborateur, son propriétaire administrateur. Aucun
reviewer indépendant ni identité technique dédiée aux tags n'existe; les
environnements `prerelease` et `production` n'ont donc pas été créés avec une
protection fictive. Le token de contrôle n'autorise pas la lecture des réglages
GHCR (`403`), et les attestations interrogées pour les deux digests RC4 sont
absentes (`404`).

La lecture publique non mutative observe DNS A `79.137.34.84`, Nginx sur
80/443, HTTP 301 vers HTTPS, TLS/HSTS et en-têtes attendus, puis
`/api/health` HTTP 200 avec `db=ok` et la version RC4
`da97e5222e0978d9e4af08afe70a08d49a80f4de`. Elle tranche la topologie B au
bord uniquement. Sans cible SSH nominative, elle ne prouve pas l'intérieur
Compose/conteneurs/images/digests/binds/`nginx -T`.

## 6. Arrêt

Le verdict local est `BLOCKED_EXTERNAL`. Les six P1 locaux sont `FIXED` et
aucun risque résiduel local P1 ou bloquant n'est ouvert; les trois P2 déjà
documentés restent non bloquants. La seule action humaine restante est une
décision organisationnelle fournissant simultanément un reviewer réellement
indépendant et une identité technique dédiée aux tags.

Aucun compte ou environnement fictif n'a été créé. Aucun push, PR, merge, tag,
release, publication d'image, déploiement, SSH, DNS ou changement VPS n'a été
effectué.
