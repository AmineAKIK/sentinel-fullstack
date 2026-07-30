# Profil GitHub distant et politique de publication P2

Ce document décrit les réglages **distants** nécessaires à
`.github/workflows/release.yml`. Ils ne sont pas créés par le workflow et leur
configuration exige une autorisation GitHub séparée.

Le 30 juillet 2026, l'agent d'audit a créé et configuré les trois rulesets
décrits ci-dessous; le propriétaire ne les avait ni créés ni configurés
manuellement. Le profil initial exigeant un reviewer indépendant sur `main` et
une identité technique dédiée pour contourner l'interdiction de création des
tags était une **simulation de gouvernance** entreprise pendant l'audit. Il ne
correspond pas au profil honnête d'un dépôt maintenu par son propriétaire
unique.

Cette simulation a été corrigée sur instruction explicite du propriétaire :
`main` reste protégé par PR, six checks stricts, résolution des conversations
et merge commit uniquement, mais sans approbation impossible; la règle
d'interdiction de création des tags est désactivée et conservée comme preuve
historique; l'immutabilité des tags créés reste active. Aucun environnement
incomplet n'a été créé. Aucun `GO v1.0.0` n'est accordé avant les preuves
réelles de publication, VPS, déploiement et recette.

La politique locale reste l'autorité sur la syntaxe des tags :

```regex
RC     ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)-rc\.([1-9][0-9]*)$
stable ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$
```

Dans les deux cas, le commit pelé du tag doit être la tête exacte de `main` et
les six jobs CI doivent appartenir au même run `push` sur `main`, avec
`headSha == TAG_SHA`, `status == completed` et `conclusion == success`.

## 1. État distant corrigé et historique de la simulation

État relu après correction le 30 juillet 2026 sur
`AmineAKIK/sentinel-fullstack` :

| Réglage | État actif vérifié | Portée |
| --- | --- | --- |
| visibilité / branche par défaut | public / `main` | inchangé |
| Actions autorisées | `selected`, GitHub-owned + `docker/*` | actif |
| actions épinglées par SHA obligatoire | `true` | actif |
| permissions du token / approbation PR | `read` / `false` | actif |
| ruleset `main` | actif, ID `20004078`, sans bypass, approbations `0`, dernier push `false` | profil propriétaire unique |
| ruleset création `v*` | **désactivé**, ID `20004127`, objet conservé | preuve de la simulation |
| ruleset immutabilité `v*` | actif, ID `20004113`, sans bypass | mises à jour et suppressions interdites |
| releases immuables | activées pour les nouvelles releases | actif |
| environnements | aucun | aucune protection fictive déclarée |
| collaborateurs | `AmineAKIK` seul, admin, aucune invitation | profil réel |
| packages GHCR | API `403`, scope `read:packages` absent | contrôle externe restant |
| attestations RC4 | aucune pour les deux digests RC4 (`404`) | à produire lors d'une publication autorisée |

Les trois objets ruleset sont conservés et ciblent exactement
`refs/heads/main` ou `refs/tags/v*`; seuls `20004078` et `20004113` sont actifs.
La rectification n'a créé aucun tag, release, package ou déploiement et n'a pas
modifié `main`. La PR #31 est restée le mécanisme d'intégration.

État historique lu le 29 juillet 2026 avant autorisation :

| Réglage | Valeur observée | Écart alors ouvert |
| --- | --- | --- |
| Actions autorisées | `all` | à restreindre |
| actions épinglées par SHA obligatoire | `false` | à activer |
| environnements | aucun | `prerelease` et `production` à créer |
| rulesets | aucun | protections `main` et tags à créer |
| releases immuables | désactivées | à activer |

## 2. Settings → Actions → General

- [x] conserver `Default workflow permissions: Read repository contents and
      packages permissions`;
- [x] conserver `Allow GitHub Actions to create and approve pull requests`
      désactivé;
- [x] activer `Require actions to be pinned to a full-length commit SHA`;
- [x] choisir `Allow select actions and reusable workflows`;
- [x] autoriser les actions GitHub officielles (`actions/*`) et explicitement
      `docker/*`; ne pas autoriser globalement tous les auteurs Marketplace;
- [x] vérifier qu'aucune politique d'organisation/entreprise plus large ne
      réactive les références par tag.

Cette politique ne doit être activée qu'après intégration des SHA complets dans
**tous** les workflows, pas seulement `release.yml`.

## 3. Ruleset actif pour `main`

Le ruleset de branche actif cible exactement `refs/heads/main`, sans bypass :

- [x] bloquer les suppressions et les force-push;
- [x] exiger une pull request avant fusion;
- [x] exiger la résolution des conversations et invalider les approbations
      devenues obsolètes;
- [x] fixer `required_approving_review_count` à `0`;
- [x] fixer `require_last_push_approval` à `false`;
- [x] exiger une branche à jour avant fusion;
- [x] rattacher à l'application GitHub Actions les six checks exacts :

  1. `Backend / Quality`;
  2. `Frontend / Quality`;
  3. `Backend / PostgreSQL integration`;
  4. `Browser / Critical journeys`;
  5. `Containers / Production contract`;
  6. `Ops / Backup and restore drill`.

Ne pas activer `Require linear history` : Sentinel publie après une vraie
fusion par merge commit et cette règle interdirait ce contrat.

Le réglage initial `1` approbation avec approbation obligatoire du dernier push
a été créé par l'agent pendant l'audit, sans intervention manuelle du
propriétaire. Il simulait un reviewer inexistant et n'est plus le profil actif.

## 4. Rulesets pour les tags de version

Deux objets distincts ciblent `refs/tags/v*`.

Ruleset A — export historique de la simulation de création :

```json
{
  "id": 20004127,
  "name": "Sentinel version tag creation",
  "target": "tag",
  "enforcement": "disabled",
  "conditions": {
    "ref_name": {
      "include": ["refs/tags/v*"],
      "exclude": []
    }
  },
  "rules": [{ "type": "creation" }],
  "bypass_actors": []
}
```

Cet objet n'est pas supprimé : son export et son ID prouvent la simulation
entreprise. Comme son enforcement est `disabled`, il n'interdit plus la
création d'un nouveau tag `v*` par le propriétaire autorisé.

Ruleset B — immutabilité, sans aucun bypass :

- [x] activer `Restrict updates`;
- [x] activer `Restrict deletions`;
- [x] bloquer tout force-push de tag;
- [x] ne définir aucun acteur de bypass.

La création d'un nouveau tag reste une opération explicitement autorisée et
séparée. Une fois le tag créé, le ruleset actif `20004113` interdit sa
modification et sa suppression. Le workflow de publication ne crée, ne déplace
et ne supprime jamais de tag.

Le workflow de publication ne se déclenche volontairement **pas** sur
`push.tags` : GitHub chargerait alors le fichier workflow depuis le commit
taggé, et un tag posé sur un ancien commit pourrait exécuter une ancienne
politique. La publication se lance par `workflow_dispatch`, en sélectionnant
strictement `main` et en fournissant le tag existant dans l'entrée `tag`. Le
collecteur refuse tout autre événement ou toute autre ref, puis exige que le
commit pelé du tag, le checkout et `origin/main` soient identiques.

Cette conception locale ne peut pas effacer l'historique Git : avant P2,
`.github/workflows/release.yml` réagissait aux push de tags et pouvait publier
depuis le commit taggé. Le passage à `workflow_dispatch`, la validation stricte
de la cible et l'immutabilité active protègent le nouveau chemin de
publication. Ils ne constituent pas, à eux seuls, un `GO v1.0.0`.

## 5. Environnements de publication non configurés

Les exigences ci-dessous décrivent le design fail-closed du workflow de
publication; elles ne constituent ni le profil actif de `main`, ni un réglage
que le propriétaire aurait appliqué. Aucun environnement GitHub n'est
actuellement déclaré et aucune approbation indépendante n'est requise pour
fusionner la PR #31.

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

Le 30 juillet 2026, le seul collaborateur est `AmineAKIK` avec le rôle
administrateur, sans invitation en attente. Créer les environnements avec ce
seul compte simulerait une approbation indépendante impossible; ils ont donc
été laissés absents, conformément au comportement fail-closed du garde.

## 6. Releases et packages

- [x] dans `Settings → General → Releases`, activer
      `Enable release immutability`;
- [x] vérifier que cette politique s'applique aux nouvelles releases;
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

- [x] confirmer que les Artifact Attestations GitHub sont disponibles pour le
      dépôt public;
- [x] conserver par job uniquement `id-token: write` et
      `attestations: write` avec `contents: write`/`packages: write` nécessaires
      à la publication;
- [x] conserver `create-storage-record: false` sur les quatre attestations :
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

Preuves relues :

- `sha_pinning_required == true`;
- `allowed_actions == "selected"`;
- `default_workflow_permissions == "read"`;
- `can_approve_pull_request_reviews == false`;
- ruleset `main` actif avec PR, conversations résolues, six checks stricts,
  merge commit seul, approbations `0` et aucun bypass;
- ruleset `Sentinel version tag creation` ID `20004127` désactivé et conservé;
- ruleset `Sentinel version tag immutability` ID `20004113` actif, sans bypass;
- les six checks de `main` exigés sous leurs noms exacts.

Aucune preuve n'affirme que les environnements de publication sont configurés.
Leur éventuelle création et leur politique feront l'objet d'une décision
séparée. Le `GO v1.0.0` demeure `NO-GO` tant que publication, VPS, déploiement,
health/version et recette ne sont pas réellement prouvés.

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
