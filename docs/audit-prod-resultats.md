# Résultats de l'audit de publication Sentinel

> **Rapport historique, remplacé pour la décision de release.** Ce document
> conserve les preuves obtenues le 17 juillet 2026, mais son verdict technique a
> été invalidé par les écarts découverts ensuite. Le statut courant et les
> critères de fermeture sont dans
> [release-readiness.md](release-readiness.md). La release reste `NO-GO` jusqu'à
> leur vérification.

Audit final exécuté le **17 juillet 2026** sur le candidat
`a77d6cb9e449e689f34bd224b102238cac81fb6c`, publié sur `main`, selon
[production.md](production.md#15-protocole-daudit-de-production) (protocole) et
[production.md](production.md#14-checklist-de-publication) (checklist).

## Périmètre et environnement

- environnement local : Node `24.13.0`, npm `11.6.2`, sans démon Docker ni
  serveur PostgreSQL ;
- cible déclarée, CI et images : Node `24.18.0`, npm `11.16.0` ;
- PostgreSQL `15.18`, Chromium Playwright, Caddy `2.11.4`, Nginx `1.30.4` et
  ShellCheck `0.10.0` validés dans GitHub Actions ;
- les contrôles ne nécessitant ni Docker ni PostgreSQL ont aussi été rejoués
  localement ;
- aucune donnée de production utilisée.

Ce rapport distingue les preuves réellement exécutées des campagnes qui exigent
un environnement iso-production. Une case non exécutée n'est pas présentée comme
verte.

## Synthèse

| Contrat                         | Résultat prouvé                           |
| ------------------------------- | ----------------------------------------- |
| Installation reproductible      | OK, `npm ci` backend et frontend          |
| Format, lint, types, builds      | OK                                        |
| Backend unitaire                | **32 suites, 354 tests**                  |
| Frontend unitaire               | **34 fichiers, 346 tests**                |
| Fiabilité structurelle          | **20 contrôles sur 20**                   |
| Intégration PostgreSQL          | **4 suites, 37 tests**                    |
| E2E Chromium                    | **4 parcours sur 4**                      |
| Audit npm                       | **0 vulnérabilité ≥ high** au 17 juillet 2026 via `npm audit --audit-level=high` (arbre complet) sur les deux projets |
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
npm run test:coverage
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

Le job distant utilise une base PostgreSQL dédiée `sentinel_test`. Un garde-fou
exécuté en CLI et dans Jest refuse l'intégration si `NODE_ENV=production`, si
`DATABASE_URL` manque ou si le nom de base ne se termine pas par `_test` ou
`_integration`. Les quatre suites et leurs 37 tests couvrent l'authentification,
les comptes, les lignes et l'Atelier sur le schéma réellement migré.

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
- SHA Git complet obligatoire, exposé par la santé et inscrit dans les labels
  OCI des images ;
- routes API inconnues et erreurs de parsing renvoyées en JSON sans exposer
  Express ;
- fixtures PostgreSQL protégées par suffixe et seed de démonstration destructif
  soumis à une confirmation explicite non persistable dans `.env` ;
- payload JSON limité, validations Zod et contraintes SQL ;
- migrations sérialisées, checksums vérifiés et migrations publiées immuables ;
- mutations critiques transactionnelles et conflits SQL traduits ;
- journal d'audit actor-aware et snapshots de ligne ;
- outbox durable, retry borné et arrêt gracieux ;
- recherche statique sans secret réel, test exclusif ni artefact généré suivi ;
- fichiers YAML parsés par Prettier et scripts backup/restore valides avec
  `bash -n` et ShellCheck `0.10.0` ;
- artefact backend de production nettoyé avant build, sans tests compilés,
  déclarations TypeScript ni source maps.

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

Au contrôle RC4 du 28 juillet 2026, l'audit production backend signale zéro
vulnérabilité. L'audit frontend conserve deux advisories React Router modérées,
suivies dans l'issue `#29`. La migration React Router 7 reste hors RC4 et aucun
`npm audit fix --force` n'est admis.

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

Le candidat technique `a77d6cb9e449e689f34bd224b102238cac81fb6c` est validé
par le [run GitHub Actions 240](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29547477634).
Les cinq jobs sont verts : qualité backend, qualité frontend, intégration
PostgreSQL, parcours navigateur et contrat de production des conteneurs. Ce
dernier confirme les deux variantes Compose, les labels de provenance, les deux
images et leurs utilisateurs non-root, l'artefact runtime minimal, Nginx intégré,
Nginx hôte, Caddy et ShellCheck.

Le run précédent a détecté un sur-échappement dans l'assertion de label Docker.
La syntaxe a été corrigée dans `a77d6cb`, puis toute la matrice a été rejouée :
les cinq jobs et toutes les étapes obligatoires du run 240 sont réussis. Seul
l'upload conditionnel des diagnostics Playwright est logiquement ignoré en
l'absence d'échec.

## État de l'instance publique

La sonde HTTPS du 17 juillet 2026 confirme que le VPS est disponible et que sa
base répond. Elle prouve aussi que le déploiement actuellement servi précède ce
candidat : `/api/health` ne contient pas encore `version`, la réponse expose
encore `X-Powered-By: Express`, et la page racine sert l'ancien titre et les
anciens bundles.

Le dépôt et le VPS ne doivent donc pas être déclarés alignés à ce stade. Après
déploiement, la propriété `version` devra être strictement égale au résultat de
`git rev-parse HEAD` sur le checkout effectivement déployé, puis la recette
courte devra être consignée.

## Contrôles restant externes

Ces points ne constituent pas une preuve locale et restent obligatoires avant un
GO de production :

1. sauvegarde réelle du VPS, copie hors site et RTO sur l'infrastructure cible
   (l'exercice PostgreSQL jetable local RC4 est vert `11/11`, RTO `5 s`) ;
2. charge et endurance sur un volume représentatif ;
3. Lighthouse et lecteur d'écran manuel (axe-core, clavier et focus RC4 sont
   verts localement) ;
4. recette Chrome, Edge, Firefox, Safari et écran Board cible ;
5. déploiement du candidat validé, puis vérification HTTPS des cookies, headers,
   CORS, SMTP, logs et du SHA retourné par `/api/health`.

## Verdict historique du 17 juillet 2026 — invalidé

**GO technique rendu à cette date, désormais invalidé pour la release.** Aucun
défaut bloquant n'était alors connu dans les contrats locaux ou distants
automatisés. Le VPS
actuel n'est toutefois **pas encore aligné** sur ce candidat : le GO de mise à
jour production reste conditionnel au backup, au déploiement, à la vérification
du SHA et à la recette décrits ci-dessus.
