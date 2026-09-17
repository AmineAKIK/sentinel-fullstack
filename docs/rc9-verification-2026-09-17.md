# RC9 — vérification datée du 17 septembre 2026

Cette photographie distingue les preuves consultées des contrôles exécutés.
Elle ne garantit pas un état permanent de la production et ne remplace pas une
recette authentifiée. Les preuves RC8 restent historiques.

## Release consultée sur GitHub

- Tag immuable : [`v1.0.0-rc.9`](https://github.com/AmineAKIK/sentinel-fullstack/releases/tag/v1.0.0-rc.9).
- SHA du tag et de `main` **au moment de cette vérification** :
  `ed26a25e3c005cabb0da30a4553dfbbee03afe81`.
- [CI sur ce SHA](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/35077903174) :
  six jobs réussis, incluant PostgreSQL, parcours navigateur, conteneurs et
  exercice de sauvegarde/restauration.
- [Publication de release](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/35131302625) :
  réussie ; deux SBOM publiés et liens d'attestation présents. Cette consultation
  n'est pas une nouvelle vérification cryptographique des attestations.
- Backend publié :
  `ghcr.io/amineakik/sentinel-fullstack/backend@sha256:fe0c5c1d7577042aab3077e0e3dda699d4faa2c16d4c07b5d8c5267574b372a2`.
- Frontend publié :
  `ghcr.io/amineakik/sentinel-fullstack/frontend@sha256:061b02f6d58fdb4f0b85a65f971b4066fd50ea18f2013e5f8c8674c817608714`.

## Observation publique en lecture seule

`https://sentinel.akiksystems.fr/api/health` a répondu HTTP 200 :

```json
{"status":"ok","db":"ok","version":"ed26a25e3c005cabb0da30a4553dfbbee03afe81"}
```

Les pages `/`, `/admin`, `/workshop/dashboard` et `/board` ont répondu HTTP 200.
Les réponses contrôlées présentaient un seul header HSTS de valeur
`max-age=31536000; includeSubDomains`. Les trois ressources JS/CSS directement
référencées par la page d'entrée répondaient également HTTP 200.

**Limites :** recevoir la coque HTML d'une route SPA ne prouve pas la réussite
d'une connexion ou d'une mutation métier. Cette observation ne constitue pas
une inspection SSH des conteneurs, de leurs digests effectifs, des ports internes
ou des sauvegardes. Aucun de ces éléments n'est déduit du seul health public.

## Contrôles locaux sur le code RC9

Sous Windows avec Node.js 24.19.0 et npm 11.16.0 (la CI emploie Node.js 24.18.0) :

- Backend : 626 tests unitaires, 51 suites, réussis ; 17 contrôles de fiabilité.
- Frontend : 787 tests unitaires, 72 fichiers, réussis.
- ESLint et compilation TypeScript des deux applications réussis ; build Vite réussi.
- Audits npm complets backend et frontend : aucune vulnérabilité signalée à cette date.
- Politique de dépendances et formatage réussis avec les octets LF du dépôt.
- Les logs CI consultés indiquent 165 tests d'intégration et 161 tests navigateur
  réussis ; ces chiffres sont des résultats CI, pas un nouveau passage local.

L'essai d'un clone Windows avec conversion automatique CRLF a révélé une
différence de checksums de lockfiles et de formatage. Les améliorations de
portabilité post-RC9 imposent LF via `.gitattributes` et utilisent l'option `env`
de Playwright à la place d'affectations shell Bash. Elles ne réécrivent aucune
migration historique, ne déplacent pas le tag et ne déploient pas la production.
Pour les commandes reproductibles, voir [le guide jury](jury-quickstart.md).
