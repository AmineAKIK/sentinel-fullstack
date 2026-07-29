# Audit final incrémental Sentinel RC5

**Date :** 30 juillet 2026

**Verdict :** `BLOCKED`

La fermeture express ne satisfait pas la condition de sortie « seules deux
alertes upstream restent ». Les deux exceptions de dépendances sont strictement
bornées et aucune vulnérabilité exploitable n'a été mise en évidence dans leur
surface réelle, mais l'audit incrémental a identifié six défauts P1 locaux non
couverts par les suites existantes. Ils ne sont pas corrigés dans cette phase,
qui n'autorisait aucune modification du runtime ou des tests applicatifs.

## 1. Périmètre et couverture

Le grand audit de référence porte sur le commit
`29db4d1eeb49f5850ce6c5c64dc1dcf5aba78bb2` et ses `550` fichiers. Son registre
`/tmp/sentinel-rc5-audit-29db4d1/tracked-audit-register.tsv` a le SHA-256
`bdc8ba5a778dcf6f9194befc51312ea22f2f0af791ae4b79f26ce22bcbc36a23`.

La fermeture express a audité les changements jusqu'au parent documentaire
`1a8bb63fff99a6f6363f4a3b2d8227afa159487a`, puis a relu ses propres artefacts
finaux :

| Provenance | Fichiers | Traitement |
| --- | ---: | --- |
| inchangés depuis `29db4d1` | `472` | hash Git identique ; héritage de `471` statuts `REVIEWED` et d'un statut `LOCKFILE_VALIDATED` |
| modifiés ou ajoutés depuis `29db4d1` | `102` | diff et contenu courant relus |
| rapport et registre finaux | `2` | autorelecture ; le registre porte un marqueur non récursif pour sa propre ligne |
| **total courant** | **`576/576`** | **`100 %`** |

Le registre exhaustif est
[`rc5-final-audit-register.tsv`](rc5-final-audit-register.tsv). Chaque chemin
courant y possède son blob, son SHA-256, sa provenance, son statut final et, le
cas échéant, l'identifiant du constat. La ligne du registre lui-même utilise
`SELF_REVIEWED_NO_RECURSIVE_HASH` : intégrer son propre hash rendrait le fichier
récursif et impossible à stabiliser.

## 2. Fast path légitime

Les manifestes ont été capturés au HEAD de départ
`514469896299bf27c2ce52ab3c5621f78cea44b1`. Après les travaux de politique et
de documentation, les six catégories restent byte-identiques :

| Catégorie | Fichiers | SHA-256 agrégé avant = après |
| --- | ---: | --- |
| runtime backend/frontend | `253` | `39a259c2fab0c1930f34c4787cdc8e58462fb12f2ec0614ef79fc15f197ea187` |
| tests applicatifs existants | `176` | `9002fccc945eedfc652fd0a1716e6e52ad4dd6e1323d967389bd2fed9c362be1` |
| manifests et lockfiles | `4` | `48b1cbbb9a558607b5c037f89b633b78d9a90629f62e952717c7a2eab3ffe9b0` |
| Dockerfiles | `4` | `9aee89281365d60f5a8f1438830674215ba02db9746e4f4cc7636d40011b1edd` |
| Compose et scripts d'exploitation | `17` | `95480d568d72538bc589bd6cdeaf983f4ea3e5e72764458b6b49a4f1d341a91d` |
| migrations `001..050` | `50` | `5453a99d974465a667d707567019bb09415509f5172b60d0dc1503649701226` |

Les preuves longues ont donc été réutilisées conformément au fast path :
backend `604/604`, PostgreSQL `165/165`, frontend `754/754`, Chromium
`156/156 ×3` sur bases fraîches avec axe, restore `21/21`, préflight `25/25`
et images locales déjà construites.

Les validations propres aux nouveaux changements ont réellement été exécutées :

- garde des exceptions : rouge initial `15` tests et `25` assertions en échec,
  puis vert `15/15`;
- audits JSON réels conformes à la politique : backend runtime `0 high`,
  backend complet `20 high` Brace uniquement, frontend runtime `2 high` Router
  uniquement, frontend complet `8 high` limités aux deux GHSA;
- garde des payloads des deux images locales : Brace absent;
- politiques release `10/10`, gate `1/1`, workflow `8/8`, `actionlint` vert;
- syntaxe du générateur Python, liens Markdown locaux et `git diff --check`
  verts.

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

## 4. Constats P1 bloquants

| ID | Constat et preuve | Impact |
| --- | --- | --- |
| `RC5-AUD-01` | `assertProductionConfig()` accepte un `CLIENT_ORIGIN` HTTPS avec slash final, tandis que `createCsrfProtection()` refuse la même valeur. Reproduction Node 24 sans réseau : `assertProductionConfig=PASS`, puis `createCsrfProtection=FAIL: CLIENT_ORIGIN must be an exact absolute origin.` | préflight faussement vert puis backend arrêté avant écoute |
| `RC5-AUD-02` | `useJournalData` annule un chargement de page lors d'un changement de filtre sans remettre atomiquement `loadingMore` et `nextCursor`; une période inversée conserve aussi les anciennes données | bouton bloqué sur « Chargement… », curseur d'un ancien filtre ou données périmées |
| `RC5-AUD-03` | les dates `start`/`end` de l'URL sont converties sans validation civile stricte. Reproduction Node 24 : `invalid` produit `RangeError: Invalid time value`; `2026-02-31` devient `2026-03-03T00:00:00.000Z` | ErrorBoundary ou période silencieusement différente de l'URL |
| `RC5-AUD-04` | l'erreur de mot de passe dans `AdminPasswordConfirmModal` n'est reliée au champ par aucun `id`, `aria-describedby` ou `aria-invalid` | erreur non associée programmatiquement, WCAG 1.3.1/3.3.1 |
| `RC5-AUD-05` | la branche désactivée de la durée Board rend un champ sans l'`id` ciblé par le `label` | libellé non associé, WCAG 1.3.1 |
| `RC5-AUD-06` | les champs Journal visibles « Début » et « Fin » sont renommés « Depuis le » et « Jusqu'au » par `aria-label` | violation Label in Name, WCAG 2.5.3 |

Les fichiers et tests concernés sont identifiés dans le registre. Aucun P0,
secret réel ou vulnérabilité exploitable supplémentaire n'a été détecté.

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

Le verdict est `BLOCKED`, et non `BLOCKED_EXTERNAL` : l'absence d'identités de
gouvernance reste un blocage externe, mais elle n'est plus la seule cause après
les six constats P1 locaux. Aucun push, PR, merge, tag, release, publication
d'image, déploiement, accès SSH ou changement VPS/DNS n'a été effectué.
