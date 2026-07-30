# RC5 — Audit du retour global des mutations

## Portée

Ce document rattache le correctif P1 de la RC5 à l'inventaire exhaustif
`docs/rc4-mutation-inventory.md`. Le balayage porte sur les appels de
`useMutationRunner`, le fournisseur `MutationFeedback`, le portail
`.mutation-feedback-region`, les composants `SuccessBanner` et `ErrorBanner`,
ainsi que les états locaux nommés comme des bannières ou notifications.

L'inventaire de référence reste composé de **61 interactions** :

- 24 Atelier ;
- 24 Administration ;
- 11 Authentification/Board ;
- 2 Support.

Son résultat reste **59 `COVERED`**, **2 `EXCEPTION_PROVEN`** et
**0 `GAP`/`PARTIAL`**. Les deux exceptions sont exclusivement les réactions
système à un `401` dans `AppAuthContext` et dans le rafraîchissement Board. Les
59 mutations explicites utilisent le contrat partagé ; aucune n'a été
reclassée ou soustraite pour ce correctif.

## Cause racine et architecture

En RC4, `GlobalFeedbackRegion` était bien rendu par portail comme frère de
`#root`, mais `.mutation-feedback-region` ne possédait aucune règle de
positionnement. Son bloc suivait donc le flux normal après l'application et
héritait d'une présentation de bannière horizontale : largeur du viewport,
position statique et arrivée au bas de la page.

La RC5 conserve un fournisseur et un runner uniques, et change uniquement leur
présentation et leur cycle de vie :

- région fixe sous la navigation, à droite, avec largeur bornée et safe areas ;
- carte compacte issue des tokens Sentinel, avec icône, titre, message, accent,
  ombre et cible de fermeture de 44 px ;
- succès et informations annoncés poliment, sans vol de focus, pendant environ
  six secondes ;
- délai suspendu au survol et au focus, puis repris avec le temps restant ;
- erreurs annoncées par `role="alert"` et persistantes jusqu'à fermeture ou
  remplacement par le résultat d'une nouvelle action ;
- génération de feedback et nettoyage au démontage empêchant un ancien timer
  de fermer un résultat plus récent ;
- verrou synchrone global conservé : deux activations rapprochées ne produisent
  qu'une mutation ;
- erreurs issues d'une modale portées dans le dernier dialogue actif pour ne
  pas être masquées par l'overlay ou rendues inaccessibles par `inert` ;
- succès portés par `body` afin de rester visibles après la fermeture de la
  modale ;
- pending conservé sur le bouton ou l'action concernée, sans notification
  globale supplémentaire.

L'implémentation affiche un résultat global à la fois. Ce remplacement est
déterministe et cohérent avec le verrou global, qui interdit deux mutations
concurrentes. La région est néanmoins un conteneur vertical avec espacement,
sans barre de pleine largeur.

## Audit des surfaces et retours locaux

| Surface | Consommateurs réels | Classement RC5 |
| --- | --- | --- |
| Atelier | création/édition d'incident, panneau, confirmations, arbitrage, dashboard et authentification Atelier | Résultats métier globaux via `useMutationRunner` |
| Administration | comptes, lignes, machines, plan, archivage, tâches, réglages, audit des sessions et authentification Admin | Résultats métier globaux via `useMutationRunner` |
| Board | accès, sortie, activation/réglages et paramètres locaux explicites | Résultats métier globaux via `useMutationRunner`; réaction automatique `401` inchangée et prouvée |
| Support | `SupportChat` partagé Admin/Atelier | Résultats métier globaux via `useMutationRunner` |
| Authentification | connexions, premières connexions, réinitialisation et déconnexions | Résultats métier globaux via `useMutationRunner`; réaction automatique `401` inchangée et prouvée |

Quatre anciens systèmes de succès locaux temporisés faisaient doublon avec le
succès global et ont été supprimés :

- `UserListPage` ;
- `UserDetailPage` ;
- `LinesPage` ;
- `LineDetailView`.

Deux `SuccessBanner` locaux restent intentionnellement présents :

- `CreateUserModal`, pour conserver à l'écran le code temporaire à usage
  unique ;
- `ResetPasswordConfirmModal`, pour conserver le nouveau code temporaire à
  usage unique.

Ils ne sont ni des toasts ni des confirmations fugaces : leur contenu doit
rester consultable et copiable dans la modale. Les `ErrorBanner` restants sont
des erreurs de chargement, de validation de champ, de période ou de panneau
local ; ils ne doublonnent pas les erreurs globales de mutation. Les bannières
`board-stale-banner` et `incident-followed-resolved-banner` décrivent un état
persistant du dossier ou de l'écran, pas le résultat transitoire d'une
mutation.

## Preuves rouges exécutées avant correction

### Composants et architecture

Commande :

```text
npx vitest run src/components/ui/__tests__/MutationFeedback.test.tsx src/components/__tests__/RemainingMutationArchitecture.test.ts
```

Résultat : **10 échecs, 44 succès sur 54 tests**. Les échecs prouvaient
exactement :

- les quatre succès locaux temporisés concurrents ;
- l'absence des titres `Action réussie` et `Action impossible` ;
- l'absence du bouton `Fermer la notification` sur succès et erreur ;
- l'absence de pause du délai au survol et au focus.

### Chromium et PostgreSQL jetable

Commande :

```text
DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh \
  npm --prefix frontend run test:e2e -- e2e/mutation-feedback-geometry.spec.ts
```

Résultat : **2 échecs sur 2 tests**, après de vraies créations et annulations
contre le frontend, le backend et PostgreSQL. Les mesures rouges étaient :

| Parcours | Viewport | Position | Largeur | Marge droite | Bas de carte |
| --- | --- | --- | ---: | ---: | ---: |
| Création Atelier | 1440×900 | `static` | 1440 px | 0 px | 2094,875 px |
| Annulation Atelier | 640×720 | `static` | 640 px | 0 px | 973,625 px |
| Création Admin en modale | 390×844 | `static` | 390 px | 0 px | 842,875 px |

Les cartes n'avaient ni titre, ni ombre, ni bouton de fermeture conforme. Les
échecs finaux provenaient de la recherche du bouton de fermeture requis, après
les assertions géométriques souples. Le premier lancement avait été refusé par
la garde de sécurité avant tout test, car la base indiquée n'était pas suffixée
`_e2e`; il ne constitue pas une preuve rouge.

## Preuves vertes ciblées

Les tests composants et architecture passent à **54/54**. Les parcours
transversaux ciblés passent à **7/7** : création, annulation, mutation Admin
depuis une modale, erreurs réseau Auth, erreur et réessai du cycle incident,
erreurs métier Support Admin et Atelier.

Les mesures Chromium vertes, attachées comme JSON aux résultats Playwright,
sont :

| Parcours | Viewport | Carte | Marge droite | Position verticale | Bas libre |
| --- | --- | --- | ---: | ---: | ---: |
| Création Atelier | 1440×900 | 400×66,39 px | 16 px | y=72 px, navigation à 56 px | 761,61 px |
| Annulation Atelier | 640×720 | 400×85,89 px | 12 px | y=68 px, navigation à 56 px | 566,11 px |
| Création Admin en modale | 390×844 | 366×66,39 px | 12 px | y=68 px, navigation à 56 px | 709,61 px |

Dans les trois cas, la région est fixe, la carte est arrondie et ombrée, reste
entièrement dans le viewport et ne crée aucun débordement horizontal. La
fermeture est réellement effectuée au clavier. Aucun test n'utilise
`waitForTimeout`, `force: true`, retry applicatif ou succès simulé pour les
parcours positifs.

## Non-régression

Résultats complets du frontend :

- Vitest : **593/593** dans 58 fichiers ;
- couverture : 89,98 % statements, 83,10 % branches, 91,91 % fonctions et
  92,20 % lignes, seuils existants respectés ;
- Chromium : **59/59**, avec frontend, backend et PostgreSQL jetable ;
- Prettier, ESLint, TypeScript et build Vite : succès.

Le premier passage Chromium complet après la correction a donné 56/59. Les
trois échecs ont été lus et corrigés sans retry :

- le scénario Board tentait de cliquer à travers l'erreur persistante ; il
  ferme désormais explicitement la notification, vérifie la restauration du
  focus, puis réalise le vrai réessai ;
- le scénario machine attendait l'ancien texte de bannière locale au lieu du
  message métier global `Machine modifiée.` ;
- le scénario de mutations Atelier enchaînait des clics sous les confirmations
  précédentes ; il ferme désormais chaque carte explicite avant l'action
  suivante.

Les trois fichiers ont d'abord repassé **9/9**, puis la suite Chromium intégrale
a repassé **59/59**. Chaque exécution PostgreSQL s'est terminée par la
suppression du conteneur et du volume jetables.

Aucun fichier backend ni aucune migration n'est modifié par ce correctif.
