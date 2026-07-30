# Exceptions de sécurité des dépendances RC5

État au 30 juillet 2026.

La source normative et lisible par la CI est
[`security/dependency-exceptions.json`](../security/dependency-exceptions.json).
Le présent document explique son exploitation; il ne permet pas d'ajouter une
exception qui ne serait pas fermée par le garde.

## Périmètre fermé

Le propriétaire du risque est `repository-owner:AmineAKIK`. Les deux
exceptions expirent le **31 août 2026 inclus** : à compter du 1er septembre
2026, le garde échoue avant l'analyse des audits. Aucune autre advisory,
classification, portée ou échéance n'est acceptée.

| Advisory | Borne officielle | Traitement RC5 borné |
| --- | --- | --- |
| [`GHSA-qwww-vcr4-c8h2`](https://github.com/advisories/GHSA-qwww-vcr4-c8h2) | `react-router >=7.12.0 <8.3.0` | `not-applicable` uniquement tant que Sentinel reste sous React 18, React Router et React Router DOM exactement `7.18.2`, en Declarative Mode, sans dépendance ni API RSC instable |
| [`GHSA-mh99-v99m-4gvg`](https://github.com/advisories/GHSA-mh99-v99m-4gvg) | `brace-expansion <=5.0.7` | `upstream-dev-only` uniquement pour les chemins Jest/ts-jest/ESLint/jsx-a11y consignés; aucune présence dans la fermeture runtime de l'application ou dans le payload applicatif des images |

La première exception ne nie pas l'advisory Router : elle constate que l'avis
limite l'impact aux APIs instables React Server Components et ferme
automatiquement la dérogation si cette surface apparaît. La seconde ne qualifie
pas Brace de faux positif : elle accepte temporairement un risque de
disponibilité de l'outillage amont, sans l'étendre au produit exécuté.

Aucun package, lockfile, override, Dockerfile, fichier Compose ou code
applicatif n'est modifié par cette politique. Les versions `brace-expansion`
1.1.16 et 2.1.2 restent vulnérables dans les chaînes de développement exactes;
la recherche D2 d'une mise à jour parente compatible reste donc ouverte en
amont.

## Garde automatique

[`scripts/dependency_exception_guard.py`](../scripts/dependency_exception_guard.py)
est fail-closed. Il vérifie le dépôt avant chaque audit et avant l'inspection
des images. Il échoue notamment si :

- le propriétaire, les deux GHSA exactes, leurs bornes, classifications,
  portées ou l'échéance changent;
- un des deux lockfiles change, ce qui impose une nouvelle évaluation D2;
- la version ou le mode Router change, React n'est plus en majeure 18, une
  dépendance/API RSC ou un fichier de Framework Mode apparaît;
- une installation ou un chemin transitif Brace diffère de l'inventaire;
- `brace-expansion`, `glob` ou `minimatch` devient atteignable depuis les
  dépendances runtime;
- le code applicatif commence à importer un de ces outils et peut donc lui
  transmettre un motif contrôlable;
- Brace apparaît dans `/app/node_modules` de l'image backend ou dans le payload
  statique de l'image frontend;
- un audit runtime contient Brace, un audit backend contient Router, une GHSA
  high/critical supplémentaire est directe ou masquée par un nœud transitif,
  ou une exception attendue disparaît sans retrait explicite de la politique.

La CI exécute les audits npm JSON **runtime et complets** des deux workspaces.
Le code retour non nul attendu de `npm audit` n'est jamais neutralisé seul :
seul le garde peut accepter le document JSON, après résolution de chaque nœud
high/critical jusqu'à sa GHSA directe. Le job Containers inspecte ensuite les
deux payloads applicatifs réellement construits.

Les tests permanents sont dans
[`scripts/test-dependency-exception-policy.py`](../scripts/test-dependency-exception-policy.py).
Ils exercent les deux chemins acceptés ainsi que les refus d'expiration, de
lockfile, de graphe transitif, de version/mode Router, de React 19, de RSC,
d'usage applicatif de glob, de Brace runtime/image et de GHSA supplémentaire
directe ou cachée.

## Réévaluation obligatoire

Toute modification de `backend/package-lock.json` ou
`frontend/package-lock.json` fait échouer le SHA-256 enregistré avec le message
`D2 re-evaluation required`. La correction attendue n'est pas une simple mise à
jour du hash :

1. relancer `npm ls brace-expansion --all` et les audits runtime/complets;
2. vérifier d'abord si une mise à jour compatible des parents supprime les
   versions affectées;
3. réexaminer chaque chemin, usage, script d'installation et payload d'image;
4. supprimer l'exception devenue inutile ou, seulement si les deux décisions
   restent factuellement vraies, mettre à jour inventaire, hash et tests dans
   la même revue;
5. rejouer toutes les commandes ci-dessous.

Une résolution amont, un changement de surface Router/RSC ou l'expiration exige
la suppression ou le remplacement explicite de la politique; ni retry, ni
`npm audit fix --force`, ni downgrade, ni override inter-majeure ne peut
prolonger silencieusement l'exception.

## Commandes de preuve

```bash
python3 scripts/test-dependency-exception-policy.py
python3 scripts/dependency_exception_guard.py repository

npm audit --omit=dev --audit-level=high --json
npm audit --audit-level=high --json
python3 scripts/dependency_exception_guard.py audit \
  --workspace backend|frontend \
  --audit-kind runtime|full \
  --audit-json /chemin/vers/audit.json

python3 scripts/dependency_exception_guard.py images \
  --backend-image sentinel-backend:ci \
  --frontend-image sentinel-frontend:ci
```

Audits réels ayant validé le parseur au 30 juillet 2026 :

| Portée | Résultat | SHA-256 du JSON brut |
| --- | --- | --- |
| backend runtime | `0 high`, `0 critical` | `96da43f7b592039b3c1389236a0d4bd6e3f634f69a428839049dd86445f513de` |
| backend complet | `20 high`, `0 critical`, tous résolus vers `GHSA-mh99-v99m-4gvg` | `60caba3a5035a0319c066cafecbf8ed7e9059ffa51ad069d27e08a2d56e8dcb4` |
| frontend runtime | `2 high`, `0 critical`, tous résolus vers `GHSA-qwww-vcr4-c8h2` | `b59b32ad1b8cd63202f10e7d55b87e54cdec3a5faec60c6c5c0dd33fad9196da` |
| frontend complet | `8 high`, `0 critical`, tous résolus vers les deux GHSA approuvées | `a60a021d97efb6c482b9d9b3688455a943d37bb38b0e3b9e4e3ea6d1e1418b02` |
