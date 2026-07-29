# Réglages GitHub externes requis par la politique de publication P2

Ce document décrit les réglages **distants** nécessaires à
`.github/workflows/release.yml`. Ils ne sont pas créés par le workflow et leur
configuration exige une autorisation GitHub séparée. Tant qu'ils ne sont pas
tous prouvés, la publication RC5 reste bloquée même si les tests locaux du
workflow sont verts. L'état distant observé ci-dessous ne satisfait pas ces
prérequis : **aucune publication RC5 n'est donc autorisée à ce stade**.

La politique locale reste l'autorité sur la syntaxe des tags :

```regex
RC     ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.([1-9][0-9]*)$
stable ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$
```

Dans les deux cas, le commit pelé du tag doit être la tête exacte de `main` et
les six jobs CI doivent appartenir au même run `push` sur `main`, avec
`headSha == TAG_SHA`, `status == completed` et `conclusion == success`.

## 1. État distant observé en lecture seule

Lecture effectuée le 29 juillet 2026 sur
`AmineAKIK/sentinel-fullstack`, sans mutation :

| Réglage | Valeur observée | État P2 |
| --- | --- | --- |
| visibilité | public | compatible avec reviewers et attestations |
| branche par défaut | `main` | conforme |
| Actions autorisées | `all` | à restreindre |
| actions épinglées par SHA obligatoire | `false` | à activer |
| permissions par défaut du token | `read` | conforme |
| Actions autorisées à approuver les PR | `false` | conforme |
| environnements | aucun | `prerelease` et `production` à créer |
| rulesets | aucun | protections `main` et tags à créer |
| protection historique de `main` | absente (`HTTP 404`) | à créer |
| releases immuables | non prouvé | à activer |

## 2. Settings → Actions → General

- [ ] conserver `Default workflow permissions: Read repository contents and
      packages permissions`;
- [ ] conserver `Allow GitHub Actions to create and approve pull requests`
      désactivé;
- [ ] activer `Require actions to be pinned to a full-length commit SHA`;
- [ ] choisir `Allow select actions and reusable workflows`;
- [ ] autoriser les actions GitHub officielles (`actions/*`) et explicitement
      `docker/*`; ne pas autoriser globalement tous les auteurs Marketplace;
- [ ] vérifier qu'aucune politique d'organisation/entreprise plus large ne
      réactive les références par tag.

Cette politique ne doit être activée qu'après intégration des SHA complets dans
**tous** les workflows, pas seulement `release.yml`.

## 3. Ruleset actif pour `main`

Créer un ruleset de branche actif ciblant exactement `refs/heads/main`, sans
bypass permanent :

- [ ] bloquer les suppressions et les force-push;
- [ ] exiger une pull request avant fusion;
- [ ] exiger la résolution des conversations et invalider les approbations
      devenues obsolètes;
- [ ] exiger au moins une approbation indépendante;
- [ ] exiger une branche à jour avant fusion;
- [ ] rattacher à l'application GitHub Actions les six checks exacts :

  1. `Backend / Quality`;
  2. `Frontend / Quality`;
  3. `Backend / PostgreSQL integration`;
  4. `Browser / Critical journeys`;
  5. `Containers / Production contract`;
  6. `Ops / Backup and restore drill`.

Ne pas activer `Require linear history` : Sentinel publie après une vraie
fusion par merge commit et cette règle interdirait ce contrat.

## 4. Ruleset actif pour les tags de version

Créer **deux** rulesets actifs et agrégés ciblant `refs/tags/v*`. GitHub
applique un bypass à tout un ruleset; séparer création et immutabilité empêche
donc le créateur autorisé d'obtenir aussi le droit de déplacer/supprimer.

Ruleset A — création contrôlée :

- [ ] activer uniquement `Restrict creations`;
- [ ] n'accorder le bypass qu'à l'identité dédiée (GitHub App ou acteur
      technique) chargée de créer un tag après avoir vérifié que sa cible est
      la tête exacte de `main`;
- [ ] ne donner aucun bypass aux administrateurs ordinaires.

Ruleset B — immutabilité, sans aucun bypass :

- [ ] activer `Restrict updates`;
- [ ] activer `Restrict deletions`;
- [ ] bloquer tout force-push de tag;
- [ ] ne définir aucun acteur de bypass.

La création d'un nouveau tag reste une opération explicitement autorisée,
séparée et réservée à cette identité de confiance. Le workflow de publication
ne crée, ne déplace et ne supprime jamais de tag.

Le workflow de publication ne se déclenche volontairement **pas** sur
`push.tags` : GitHub chargerait alors le fichier workflow depuis le commit
taggé, et un tag posé sur un ancien commit pourrait exécuter une ancienne
politique. La publication se lance par `workflow_dispatch`, en sélectionnant
strictement `main` et en fournissant le tag existant dans l'entrée `tag`. Le
collecteur refuse tout autre événement ou toute autre ref, puis exige que le
commit pelé du tag, le checkout et `origin/main` soient identiques.

Cette conception locale ne peut pas effacer l'historique Git : avant P2,
`.github/workflows/release.yml` réagissait aux push de tags et pouvait publier
depuis le commit taggé. Tant que le ruleset de création ci-dessus et
`sha_pinning_required == true` ne sont pas réellement actifs, la création de
**tout** tag `v*` reste interdite et la publication est **BLOCKED**. Le passage
à `workflow_dispatch` protège le nouveau chemin de publication; il ne
neutralise pas, à lui seul, une ancienne version du workflow.

## 5. Environnements protégés

Créer deux environnements, sans secret statique :

### `prerelease`

- [ ] ajouter au moins un reviewer indépendant de l'initiateur;
- [ ] activer `Prevent self-review`;
- [ ] désactiver `Allow administrators to bypass configured protection rules`;
- [ ] sélectionner uniquement la branche de déploiement `main`;
- [ ] ne stocker aucun token GHCR ou GitHub dans les secrets d'environnement.

### `production`

- [ ] ajouter au moins un reviewer indépendant de l'initiateur;
- [ ] activer `Prevent self-review`;
- [ ] désactiver `Allow administrators to bypass configured protection rules`;
- [ ] sélectionner uniquement la branche de déploiement `main`;
- [ ] ne stocker aucun token GHCR ou GitHub dans les secrets d'environnement.

GitHub évalue la règle de déploiement contre le `GITHUB_REF` du run. Le run
manuel autorisé a obligatoirement `refs/heads/main`; les deux environnements
doivent donc autoriser exactement la branche `main`, et non le tag fourni en
entrée. La séparation RC/stable et le choix de l'environnement sont imposés par
`scripts/release_policy.py`, puis revérifiés après l'approbation. Le garde lit
aussi l'environnement et ses policies avant de planifier le job protégé; il
refuse un environnement absent, sans reviewer, sans prévention de
l'auto-review ou sans l'unique policy `main` de type `branch`. Cela évite
l'auto-création silencieuse par GitHub d'un environnement non protégé. Si aucun
reviewer réellement indépendant n'est disponible, la protection n'est pas
simulée : la publication reste bloquée.

## 6. Releases et packages

- [ ] dans `Settings → General → Releases`, activer
      `Enable release immutability`;
- [ ] vérifier que cette politique s'applique aux nouvelles releases;
- [ ] conserver les packages GHCR `backend` et `frontend` rattachés à ce dépôt;
- [ ] leur accorder l'accès en écriture uniquement au `GITHUB_TOKEN` de ce
      dépôt;
- [ ] interdire toute suppression ou réaffectation manuelle des tags d'images
      de release;
- [ ] interdire la suppression manuelle d'une draft de réservation échouée :
      elle constitue la preuve que cette version est brûlée;
- [ ] publier les packages avec la visibilité explicitement retenue par
      l'exploitant.

Après le second garde et l'approbation protégée, le workflow crée une draft
minimale **avant** toute authentification registre : cette réservation atomique
brûle le tag de publication. Il pousse ensuite les images, attache les deux
SBOM SPDX sans `--clobber`, renseigne les notes, puis publie la draft. Toute
panne après réservation laisse la draft en place; aucun rerun ni écrasement
d'image n'est autorisé avec ce tag, et la reprise exige une nouvelle version.
Après publication immuable, le tag Git, les assets et le nom de release ne
peuvent plus être réutilisés.

## 7. Épinglage vérifié des outils et images

- le binaire Buildx est extrait de l'image officielle
  `docker/buildx-bin:0.35.0` fixée au manifeste
  `sha256:917570d8d0ae91ae49251f84f848a6801eedd114554c56a4fdf7ec88cac48eeb`;
- le workflow refuse le binaire extrait si `docker buildx version` ne renvoie
  pas exactement `v0.35.0` et la révision amont
  `a319e5b15052cf6557ceb666eb8ff6e32380b782`;
- le moteur BuildKit est fixé au manifeste
  `sha256:2f5adac4ecd194d9f8c10b7b5d7bceb5186853db1b26e5abd3a657af0b7e26ec`;
- Syft `v1.33.0` est fixé au manifeste
  `sha256:f94e5d9fce1f2278491a8e3a63bd5f6ddb81fdfdbb8bf7a1637565c1d5344357`.
- les bases Node, Nginx, PostgreSQL et Caddy des images/Compose sont toutes
  versionnées et fixées par digest;
- les outils réellement tirés par les six checks (Nginx de validation,
  ShellCheck, Actionlint, Alpine de probe, registre local et PostgreSQL
  jetable) sont eux aussi versionnés et fixés par digest.

Une évolution de Buildx, BuildKit ou Syft doit modifier explicitement ces
preuves et repasser les tests du workflow; aucun `latest` implicite n'est
autorisé.

## 8. Attestations

- [ ] confirmer que les Artifact Attestations GitHub sont disponibles pour le
      dépôt public;
- [ ] conserver par job uniquement `id-token: write` et
      `attestations: write` avec `contents: write`/`packages: write` nécessaires
      à la publication;
- [ ] conserver `create-storage-record: false` sur les quatre attestations :
      P2 atteste les images dans GHCR et n'accorde pas la permission
      `artifact-metadata: write` non nécessaire;
- [ ] vérifier après une publication autorisée les attestations de provenance
      et de SBOM des deux références `image@sha256:…`;
- [ ] vérifier que les notes de release contiennent le SHA, les deux digests,
      les quatre URLs d'attestation et les deux assets SBOM.

## 9. Contrôle distant après configuration

Ces lectures ne modifient aucun réglage :

```bash
gh api repos/AmineAKIK/sentinel-fullstack/actions/permissions
gh api repos/AmineAKIK/sentinel-fullstack/actions/permissions/workflow
gh api repos/AmineAKIK/sentinel-fullstack/environments/prerelease
gh api repos/AmineAKIK/sentinel-fullstack/environments/production
gh api repos/AmineAKIK/sentinel-fullstack/rulesets
gh api repos/AmineAKIK/sentinel-fullstack/branches/main/protection
```

Preuves attendues :

- `sha_pinning_required == true`;
- `allowed_actions == "selected"`;
- `default_workflow_permissions == "read"`;
- `can_approve_pull_request_reviews == false`;
- reviewers, `prevent_self_review`, bypass désactivé et unique policy
  `main`/`branch` présents sur les deux environnements;
- ruleset `main` et les deux rulesets agrégés `refs/tags/v*` actifs;
- les six checks de `main` exigés sous leurs noms exacts.

Enfin, effectuer un dry-run local sans token :

```bash
python3 scripts/test-release-policy.py
python3 scripts/test-release-gate.py
python3 scripts/test-release-workflow.py
```

Le test du collecteur exécute le vrai script shell et le vrai moteur avec des
doubles locaux de `git` et `gh`; il prouve l'absence de token, réseau,
authentification registre et commande de publication. La matrice couvre tags
valides/invalides, branche release, ancien commit de `main`, mauvais SHA, check
absent/non vert, environnement absent/non protégé et mauvais pattern. Le plan
de build/SBOM/attestation est vérifié structurellement, mais ce dry-run ne
prétend pas publier ni attester une image : ces effets exigent le job protégé
et un GO séparé. Il ne remplace pas non plus l'autorisation requise pour créer
les réglages distants.
