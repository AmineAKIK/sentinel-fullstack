# Résultats de l'audit de publication Sentinel

Audit exécuté le **16 juillet 2026** sur le candidat local destiné à `main`,
selon [audit-prod.md](audit-prod.md) et
[release-checklist.md](release-checklist.md).

## Périmètre et environnement

- Node local : `24.13.0` ; npm : `11.6.2` ;
- cible déclarée, CI et images : Node `24.18.0` LTS, npm `>=10` ;
- PostgreSQL temporaire réel sur `127.0.0.1:55432`, puis reproduction sur une
  seconde base vierge isolée sur le port `55433` ;
- Chromium piloté par Playwright ;
- Caddy `2.11.4` et ShellCheck `0.10.0` exécutés localement avec les versions
  exactes de la CI ; Docker reste indisponible dans cette distribution WSL et
  son contrat complet est exécuté par le job `Containers / Production contract` ;
- aucune donnée de production utilisée.

Ce rapport distingue les preuves réellement exécutées des campagnes qui exigent
un environnement iso-production. Une case non exécutée n'est pas présentée comme
verte.

## Synthèse

| Contrat                         | Résultat local                            |
| ------------------------------- | ----------------------------------------- |
| Installation reproductible      | OK, `npm ci` backend et frontend          |
| Format, lint, types, builds     | OK                                        |
| Backend unitaire                | **30 suites, 327 tests**                  |
| Frontend unitaire               | **34 fichiers, 346 tests**                |
| Fiabilité structurelle          | **20 contrôles sur 20**                   |
| Intégration PostgreSQL          | **4 suites, 37 tests**                    |
| E2E Chromium                    | **4 parcours sur 4**                      |
| Audit npm                       | **0 vulnérabilité** sur les deux projets  |
| Caddy et scripts d'exploitation | OK, Caddy `2.11.4` et ShellCheck `0.10.0` |
| Contrat conteneurs              | **OK dans la CI distante**                |

## Qualité et couverture

### Backend

Commandes validées :

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck:scripts
npm run build
npm run test:coverage -- --selectProjects unit
npm run verify:reliability
npm audit --audit-level=high
```

Couverture du périmètre critique configuré dans Jest :

| Mesure     | Résultat | Seuil |
| ---------- | -------: | ----: |
| Statements |  82,15 % |  80 % |
| Branches   |  77,38 % |  75 % |
| Fonctions  |  74,73 % |  70 % |
| Lignes     |  87,57 % |  85 % |

### Frontend

Commandes validées :

```bash
npm ci
npm run format:check
npm run lint
npm run build
npm run test:coverage
npm audit --audit-level=high
```

Couverture du périmètre critique configuré dans Vitest :

| Mesure     | Résultat | Seuil |
| ---------- | -------: | ----: |
| Statements |  88,74 % |  85 % |
| Branches   |  80,73 % |  80 % |
| Fonctions  |  91,28 % |  90 % |
| Lignes     |  91,04 % |  90 % |

Le build Vite est découpé par route. Le plus gros chunk partagé produit mesure
164,28 Ko brut / 54,13 Ko gzip ; le dashboard Atelier mesure 71,11 Ko brut /
17,91 Ko gzip. La feuille globale mesure 141,18 Ko brut / 21,92 Ko gzip.

## Base réelle et navigateur

Les quatre suites PostgreSQL couvrent l'authentification, les comptes, les
lignes et l'Atelier. Elles repartent d'un schéma migré, vérifient notamment les
contraintes, les collisions et les invalidations de session, puis nettoient leur
jeu de données. Une exécution supplémentaire sur une base entièrement vierge a
validé la création autonome de l'administrateur de test et son nettoyage : après
les 37 tests, les compteurs de fixtures admin, utilisateurs et lignes étaient
tous à zéro.

Les quatre parcours Playwright valident :

1. aucune confirmation lorsqu'une machine n'a pas réellement changé ;
2. aperçu puis confirmation lorsqu'une machine change ;
3. `Reporter` conserve l'arbitrage actif et positionne le dossier mobile en haut ;
4. décision de correction directement dans la modale mobile.

Les scénarios sont séquentiels, utilisent des ports réservés et recréent leur
jeu E2E avant exécution.

## Sécurité et intégrité

Vérifications obtenues :

- sessions Admin, Atelier et Board cloisonnées par audience, scope et cookie ;
- rôle et état actif Atelier relus en base ;
- version de session Admin invalidable ;
- secrets faibles, origine non HTTPS, proxy ambigu, ports invalides et SMTP
  incohérent refusés au démarrage de production ;
- payload JSON limité, validations Zod et contraintes SQL ;
- migrations sérialisées, checksums vérifiés et migrations publiées immuables ;
- mutations critiques transactionnelles et conflits SQL traduits ;
- journal d'audit actor-aware et snapshots de ligne ;
- outbox durable, retry borné et arrêt gracieux ;
- recherche statique sans secret réel, test exclusif ni artefact généré suivi ;
- fichiers YAML parsés par Prettier et scripts backup/restore valides avec
  `bash -n` et ShellCheck `0.10.0`.

La livraison SMTP est volontairement **au moins une fois**. La source d'outbox
est dédupliquée, mais un crash après acceptation par le fournisseur et avant
l'acquittement local peut entraîner un nouvel envoi. Cette limite est désormais
documentée et doit être supervisée.

## Dépendances

Les correctifs et versions mineures compatibles avec les plages déclarées ont
été appliqués, puis toute la matrice a été rejouée. Les types backend sont alignés
sur Node 24. `npm outdated` ne laisse que des migrations majeures indépendantes
du lot de stabilisation, notamment Express 5, React 19, React Router 7, Zod 4 et
TypeScript 7. Elles exigent chacune une campagne dédiée et ne sont pas introduites
à la veille d'une soutenance.

Dependabot regroupe les mises à jour mineures et correctives, tandis que les
versions majeures restent réservées à ces campagnes de migration. Les mises à
jour de sécurité ne sont pas désactivées. Pour l'image frontend, la branche
Nginx `1.31.x` mainline est exclue avec la syntaxe de plage propre à Docker afin
de rester sur la branche stable `1.30.x`. L'entrée Docker racine sans manifeste
a été retirée pour que chaque exécution Dependabot corresponde à un périmètre réel.
L'image de production utilise `nginx:1.30.4-alpine3.24`, dernière publication
stable disponible au moment de l'audit. Les images de construction et d'exécution
utilisent Node `24.18.0-alpine3.23`, version LTS publiée et disponible sur le
registre officiel.

## Validation distante

Le candidat technique `b9690d75422010e7bb19513d9aa1477ae7b061fb` a été
validé par le [run GitHub Actions 231](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29540419011).
Les cinq jobs sont verts : qualité backend, qualité frontend, intégration
PostgreSQL, parcours navigateur et contrat de production des conteneurs. Ce
dernier confirme Compose, les deux images, leurs utilisateurs non-root, Nginx,
Caddy et ShellCheck.

## Contrôles restant externes

Ces points ne constituent pas une preuve locale et restent obligatoires avant un
GO de production :

1. restauration réelle d'un backup sur un environnement isolé avec mesure RTO ;
2. charge et endurance sur un volume représentatif ;
3. audit axe/Lighthouse, clavier et lecteur d'écran ;
4. recette Chrome, Edge, Firefox, Safari et écran Board cible ;
5. vérification HTTPS réelle des cookies, headers, CORS, SMTP et logs.

## Verdict

**GO technique pour publication.** Aucun défaut bloquant n'est connu dans les
contrats locaux ou distants automatisés. Le **GO production reste conditionnel**
aux cinq campagnes iso-production ci-dessus. Cette réserve est une limite de
preuve, pas une validation implicite.
