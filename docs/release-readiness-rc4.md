# Préparation de la release Sentinel v1.0.0-rc.4

> Matrice vivante de correction et de preuve. Ce document ne vaut jamais
> preuve à lui seul : chaque état doit être soutenu par une commande réellement
> exécutée, sa sortie, son code de retour et l'interaction exacte qu'elle
> vérifie.

**Statut global : `NO-GO — PORTE_A_FRANCHIE / PORTE_B_FERMÉE`**

**Branche autorisée :** `release/v1.0.0-rc4`

**Base immuable :**
`e5019eef374d580eca8d4f62af61bbd3135ceecb`
(`origin/main` et `v1.0.0-rc.3^{commit}` au démarrage de la RC4)

**Périmètre :** correction, rattrapage et preuve des écarts RC3
`R4-01..R4-11`, sans nouveau domaine fonctionnel.

Les marqueurs de la forme `PENDING_EXECUTION[...]` signalent une preuve d'un
lot futur qui n'a pas encore été exécutée ou consignée. Ils ne peuvent jamais
être interprétés comme un succès et aucun d'eux ne soutient le franchissement
de la Porte A.

## 1. Contexte immuable et contraintes d'exécution

| Élément | Valeur figée ou constatée | État |
| --- | --- | --- |
| Commit publié et déployé RC3 | `e5019eef374d580eca8d4f62af61bbd3135ceecb` | `VERIFIED_BASELINE` |
| `origin/main` au démarrage | `e5019eef374d580eca8d4f62af61bbd3135ceecb` | `VERIFIED_BASELINE` |
| `v1.0.0-rc.3^{commit}` | `e5019eef374d580eca8d4f62af61bbd3135ceecb` | `VERIFIED_BASELINE` |
| Type de `v1.0.0-rc.3` | `tag` annoté ; tag immuable | `VERIFIED_BASELINE` |
| Branche RC4 | Créée exclusivement par `git switch -c release/v1.0.0-rc4 origin/main` | `VERIFIED_BASELINE` |
| Image backend RC3 | `ghcr.io/amineakik/sentinel-fullstack/backend@sha256:741bce742d61f4481b631794a79b5a345a118141cf622a9c0cf991bbc95aef52` | Référence de rollback uniquement |
| Image frontend RC3 | `ghcr.io/amineakik/sentinel-fullstack/frontend@sha256:4260317224cecdc5ad23217e81328a73787ccbc5d07188a5d277ed9748ffd5db` | Référence de rollback uniquement |
| Migrations | Exactement `001..050` ; aucune migration `051` prévue ni autorisée | `VERIFIED_BASELINE` |
| Diff migrations contre RC3 | `git diff --exit-code v1.0.0-rc.3 -- backend/migrations/` : sortie vide, code `0` au démarrage | `VERIFIED_BASELINE` |
| Fichiers suivis sur la base RC3 | `511`, mesuré par `git ls-files \| wc -l` avant création des documents RC4 | Baseline, à recompter au SHA candidat |
| Exceptions hors suivi autorisées | `Plan-RC3-Sentinel.md` et `Plan-RC4-Sentinel.md`, exclusivement | À préserver hors suivi, non modifiées, non supprimées, non ignorées |
| Actions distantes | Aucun push, PR, passage Ready, merge, tag, release, image de release, accès ou déploiement VPS sans autorisation explicite séparée | Interdit à ce stade |

Les deux plans externes ne doivent jamais être ajoutés à Git, modifiés,
supprimés, déplacés par une commande destructive ou ajoutés au `.gitignore`.
Tout autre fichier hors suivi inconnu impose un arrêt.

La RC4 n'autorise ni modification du schéma ou des permissions, ni migration
React Router 7, ni réécriture de l'historique. Si une correction semble en
exiger une, le travail s'arrête avant modification.

## 2. Règles de preuve rouge → verte

1. Le défaut est d'abord reproduit sur la base RC3 immuable. La branche RC4
   partant exactement de ce SHA peut servir de support au test rouge tant
   qu'aucune correction du défaut n'est présente.
2. Le test rouge cible l'interaction annoncée. Un clic sur le bouton du titre
   ne prouve pas un clic sur le corps de carte ; la présence d'une classe CSS
   ne prouve pas la géométrie ; un test isolé d'un hook non importé ne prouve
   pas son adoption en production.
3. La readiness conserve la commande exacte, le SHA, le code de retour, le
   résultat observé et la cause précise. Aucun résultat n'est reconstruit a
   posteriori.
4. Le test rouge n'est pas committé dans un état cassé. La correction minimale
   cohérente et le test sont committés ensemble uniquement après le vert.
5. Le vert réexécute le même test ciblé, puis les tests de surface nécessaires :
   unité/composant, PostgreSQL réel lorsque les données en dépendent, et
   navigateur réel lorsque l'interaction ou la géométrie en dépend.
6. Un test ne peut pas employer `force: true`, un retry applicatif, un timeout
   arbitraire ou une interaction de substitution pour masquer le défaut.
7. Un constat ne passe à `VERIFIED` qu'après revue du diff, preuve verte
   complète, contrôle des permissions, `git diff --check` et vérification des
   non-régressions applicables.
8. Une preuve exclusivement externe reste
   `IMPLEMENTED_AWAITING_EXTERNAL_VERIFICATION` jusqu'à son exécution autorisée
   sur la candidate réellement déployée.

### États autorisés

| État | Signification |
| --- | --- |
| `OPEN_RED_PENDING` | Défaut confirmé statiquement, test rouge non encore exécuté ou non consigné |
| `RED_PROVEN` | Test représentatif réellement rouge sur la base RC3, commande et cause consignées |
| `IN_PROGRESS` | Correction en cours après preuve rouge |
| `GREEN_TARGETED` | Même interaction verte sur les contrôles ciblés, vérifications de lot encore incomplètes |
| `VERIFIED` | Contrat entièrement prouvé sur toutes les couches requises et diff relu |
| `IMPLEMENTED_AWAITING_EXTERNAL_VERIFICATION` | Seule une vérification externe explicitement identifiée manque |
| `BLOCKED` | Condition d'arrêt du plan rencontrée et documentée |

## 3. Faits à mesurer sans recopier un ancien rapport

Les totaux finaux sont recalculés sur le SHA candidat. Les suites doivent être
disjointes avant de produire un total global.

| Fait | Commande ou méthode de dérivation | Valeur RC4 | État |
| --- | --- | --- | --- |
| Fichiers suivis | `git ls-files \| wc -l` | `513` dans l'index du lot 0 (`511` sur la base RC3 + les deux documents) ; total candidat final à recalculer | `RECOUNTED_LOT0` |
| Migrations SQL | Énumération ordonnée de `backend/migrations/[0-9][0-9][0-9]_*.sql` | `50` (`001` à `050`) | `VERIFIED_BASELINE` |
| Jobs CI | Clés de premier niveau sous `jobs:` dans `.github/workflows/ci.yml` | `6` : `backend`, `frontend`, `integration`, `e2e`, `containers`, `ops` | `RECOUNTED_LOT0` |
| Tests backend unitaires | `cd backend && npm test` | `507` tests dans `48` suites, tous verts | `RECOUNTED_LOT0` |
| Tests backend PostgreSQL | `cd backend && scripts/with-disposable-postgres.sh npm run test:integration` | `137` tests dans `20` suites, tous verts ; aucun conteneur ni volume résiduel | `RECOUNTED_LOT0` |
| Tests frontend | `cd frontend && npm test` | `468` tests dans `54` fichiers, tous verts | `RECOUNTED_LOT0` |
| Tests E2E | `cd frontend && npx playwright test --list` | `34` tests dans `10` fichiers ; inventaire seulement, non exécutés au lot 0 | `RECOUNTED_NOT_RUN` |
| Total disjoint | `507 + 137 + 468 + 34` | `1 146` tests recensés ; le sous-ensemble E2E reste à exécuter | `RECOUNTED_LOT0` |

## 4. Contrats figés à la Porte A

### 4.1 Terminologie visible

| Interne ou ancien | Libellé utilisateur obligatoire |
| --- | --- |
| Narratif atelier | Suivi de l'incident |
| Signalement | Signalement initial |
| Consigne responsable | Consigne du responsable |
| `waiting_reason` | Motif de mise en attente |
| `OPERATOR` | Opérateur |
| `MAINTENANCE` | Technicien |
| `RESPONSABLE` | Responsable |
| `ADMIN` | Administrateur |
| `SYSTEM` | Système |

« Diagnostic » est réservé à un vrai diagnostic de maintenance et aucune
section Diagnostic vide ne doit être rendue. Les formulations factices comme
`incident(s)`, `signalé(s)`, `actif(s)` et `annulé(s)` sont interdites dans le
DOM, les courriels, confirmations et captures. Les accords français sont
explicites pour `0`, `1` et le pluriel.

### 4.2 Autorité des en-têtes Nginx

- le Nginx hôte est l'unique autorité HSTS et masque le HSTS upstream ;
- le Nginx frontend gère les en-têtes de ses réponses statiques ;
- Node gère les en-têtes de `/api/*` ;
- le virtual host Sentinel bloque l'héritage des `add_header` globaux avec la
  barrière interne `add_header X-Sentinel-Inheritance-Barrier "";` ;
- cette barrière ne doit jamais être exposée publiquement ;
- la compatibilité avec Nginx `1.18.0` doit être préservée ;
- aucune modification du VPS n'est autorisée pendant les lots de
  développement.

Sur `/login` et `/api/health`, les valeurs publiques attendues sont uniques :

| En-tête | Valeur exacte |
| --- | --- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none';` |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |

`/login` possède exactement un `Cache-Control: no-cache`. `/api/health` n'a
pas de `Cache-Control` dans le contrat actuel.

## 5. Matrice RC4

| ID | Sévérité | Contrat source | Défaut prouvé sur RC3 | Commande du test rouge | Raison exacte de l'échec | Fichiers concernés | Correction minimale | Tests ciblés | Preuve verte | Risques | État |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **R4-01** | **P0** | Plan RC4 §5.1–5.2, §14.1 | `IncidentCard` ouvrait uniquement par le bouton contenant le titre. Le corps, les métadonnées, le pied, la consigne et le motif ne portaient pas l'activation principale ; le focus n'était pas restauré exactement sur le déclencheur après fermeture. | Tests permanents exécutés ensemble par `npm test -- src/components/__tests__/IncidentCard.test.tsx src/pages/__tests__/WorkshopDashboardPage.test.tsx`, puis rouge Chromium sur la métadonnée réelle ; sorties détaillées §6 | Code `1`, `10 failed / 25 passed` : métadonnée, consigne, motif et pied laissent chacun `onClick` à `0`, les ouvertures page depuis le corps échouent, le lien sémantique est absent et l'arbitrage ouvre indûment le dossier. E2E : dossier introuvable après clic souris au centre de la métadonnée. | `frontend/src/components/IncidentCard.tsx` ; `frontend/src/components/__tests__/IncidentCard.test.tsx` ; `frontend/src/pages/WorkshopDashboardPage.tsx` ; `frontend/src/pages/__tests__/WorkshopDashboardPage.test.tsx` ; `frontend/src/styles/pages/workshop.css` ; E2E Atelier concernés | `article` conservé sans rôle artificiel ; lien réel avec `href` contenant tout le contenu non interactif et pseudo-élément étiré sur les blancs ; boutons indépendants frères au-dessus ; activation Espace directe sans clic synthétique ; déclencheur exact mémorisé puis refocalisé après croix ou Échap ; arbitrage direct sans sélectionner le dossier. | Composant/page : titre, métadonnée, consigne, motif, pied, `Entrée`, `Espace`, structure DOM, étoile/arbitrages sans ouverture, focus exact croix/Échap. Chromium : clic coordonné sur métadonnée, focus visible atteint par Tab et commandes indépendantes sans drawer. | Ciblés `35/35` ; frontend `476/476` ; Chromium carte `3/3` ; parcours E2E migrés `4/4` ; lint, format et build verts ; détails §6. | Risques d'imbrication, propagation, zone morte, doublon sémantique et mauvais retour de focus couverts par tests, E2E réel et revue du diff. | `VERIFIED` |
| **R4-02** | **P0** | Plan RC4 §0, §5.2, §13 | L'ancien test nommé comme un clic sur la carte exécutait en réalité le bouton du titre ; son test clavier simulait aussi un clic, et les E2E historiques ciblaient seulement `.incident-card-open`. | Même exécution permanente rouge que R4-01 : quatre nœuds hors titre réellement cliqués, plus le scénario Chromium utilisant la géométrie de `.incident-card-meta` | Les quatre tests hors titre reçoivent `0` ouverture sur RC3 tandis que le test historique du titre reste passant ; le rouge navigateur ne trouve aucun dossier après le vrai hit-test de métadonnée. | `frontend/src/components/__tests__/IncidentCard.test.tsx` ; `frontend/src/pages/__tests__/WorkshopDashboardPage.test.tsx` ; `frontend/e2e/incident-card-activation.spec.ts` ; E2E cycle de vie, arbitrage mobile et retrait d'annulation | Ancien test renommé comme clic du titre ; tests séparés pour chaque zone réelle ; `user.keyboard` pour Entrée/Espace sans `fireEvent.click` ; E2E dédié sans `.incident-card-open`, utilisant `boundingBox()` puis `page.mouse.click()` au centre du produit ; anciens parcours migrés vers le rôle du lien. | Tests permanents distincts et assertions zéro dossier depuis les commandes indépendantes ; E2E réel métadonnée, focus, étoile et arbitrage. | Mêmes preuves vertes R4-01 : `35/35`, `476/476`, Chromium `3/3` et parcours migrés `4/4`. | Faux vert, sélecteur de substitution et clic forcé éliminés ; aucune tolérance ou `force: true`. | `VERIFIED` |
| **R4-03** | **P0** | Plan RC4 §6.1–6.3, §14.1 | Chaîne dynamique encore active : `useIncidentDrawerPosition` → `detailOffsetTop` → `--incident-detail-offset-top` → `margin-top`, avec recentrage `window.scrollBy`. Sticky, hauteur bornée et scroll interne n'annulent pas ce couplage. | Vitest permanent : `npm test -- src/pages/__tests__/WorkshopDashboardPage.test.tsx src/pages/__tests__/incidentDrawerScroll.test.ts`. Chromium réel : test `incident-detail-scroll.spec.ts` sur haut/milieu/bas, molette, `640×720`, `390×844`, viewport réduit à `390×500` et resize ; voir §6. | Vitest code `1`, `7 failed / 9 passed` : recentrage reçu avec `top: 512`, offset inline reçu `0px`, containment et gouttière absents, contrat viewport absent, overrides contraints invalides et animation horizontale présente. Chromium `7/7 failed` : bas `scrollY 1019→975`, offset `998px`, drawer `bottom 1215` ; à `640px`, `right=644` et `document.scrollWidth=644` ; mobile sans scroll interne et resize réutilisant une position hors viewport. | `frontend/index.html` ; `frontend/src/hooks/useIncidentDrawerPosition.ts` ; `frontend/src/pages/WorkshopDashboardPage.tsx` ; `frontend/src/components/IncidentDetailPanel.tsx` ; `frontend/src/styles/pages/workshop.css` ; tests page/panneau ; seed et E2E Atelier | Hook et chaîne de coordonnées supprimés ; desktop en colonne droite, `sticky` à `72px`, hauteur `vh`/`dvh` bornée ; en-tête hors scroll et corps flex `min-height: 0`, `overflow-y: auto`, containment et gouttière stable ; largeur contrainte bornée par CSS au viewport, sans animation horizontale ni recentrage ; sous `1180px`, panneau borné au layout viewport et contrat `interactive-widget=resizes-content`. | Unité/composant sur suppression du couplage, structure et viewport ; Chromium réel par clic coordonné sur métadonnée, trois positions, scroll page et interne, stabilité d'overscroll par égalités exactes, focus croix/Échap, `640×720`, `390×844`, `390×500` et resize. | Ciblés `44/44` ; nouveau Chromium `7/7` trois fois sans retry ; carte Lot 1 `3/3` ; E2E historiques `7/7` ; frontend `482/482` ; E2E complet `44/44` ; build, typage, lint et format verts ; détails et mesures §6. | Containing block, double scroll, coordonnées stale, dépassement transitoire, focus et flake couverts par assertions navigateur ; zéro calcul de géométrie en production. Le test `390×500` prouve une contraction représentative du layout viewport, pas l'ouverture d'un clavier système réel. | `VERIFIED` |
| **R4-04** | **P1** | Plan RC4 §7.1–7.3, §14.2 | `waiting_reason` n'était ni projeté par la requête Board, ni présent dans le type public, ni rendu. Aucun test Board ne vérifiait motif courant, disparition après reprise et conservation historique. | Trois rouges permanents exécutés avant correction : PostgreSQL réel `boardWaitingReasonProjection.integration.test.ts`, DOM `BoardIncidentGrid.test.tsx`, Chromium `board-waiting-reason.spec.ts` ; commandes et sorties exactes §6. | PostgreSQL : `6 failed / 1 passed`, propriété reçue `undefined` ; frontend : `3 failed / 11 passed`, phrase exacte introuvable ; Chromium : même carte ligne `999` / machine `E2E-MCH-1`, statut « En attente » visible mais motif absent. | Repository/service et tests Board backend ; type, composant, CSS et tests Board frontend ; nouveau parcours Chromium ; présente readiness. | DTO public backend explicite ; unique `CASE` de lecture conservant la valeur complète seulement pour `PENDING` non vide ; champ frontend `string \| null` ; bloc texte non interactif, complet dans le DOM et borné seulement visuellement ; aucune jointure, mutation ou migration. | PostgreSQL réel sur dix obligations ; composant sur statuts, vide, longueur et confidentialité ; Chromium attente → Atelier/panneau/Board → reprise → disparition après vrai `GET /api/board/data` → Historique conservé. | Ciblés repository `9/9`, PostgreSQL `7/7`, frontend Board/utilitaires `37/37`, Chromium `1/1` ; complets backend `508/508`, intégration `144/144`, frontend `490/490`, Chromium `45/45` ; builds, typages, lint, format et invariants verts ; détails §6. | Valeur périmée masquée deux fois (SQL et rendu), diagnostic sans repli, liste exacte des 18 clés, sentinelles privées absentes, Board sans commande, événement historique exact après reprise, polling réel documenté. | `VERIFIED` |
| **R4-05** | **P0** | Plan RC4 §8.1–8.2, §12 lots 4–5, §14.5 | Rouge initial : zéro consommateur. Lots 4–5 : toutes les mutations explicites des 61 lignes passent par le runner partagé ; les deux seules exceptions sont des réactions système à `401`. | Contrat shell exact et tests d'architecture Atelier/hors Atelier ; voir §6 | Lot 5 rouge : `35 failed`; vert ciblé : `76/76`; branche `LegacyConfirmModal`, `submittingRef` et machines locales transitoires supprimées | `MutationFeedback.tsx`, confirmations, pages Administration/Auth/Board/Support, inventaire complet | Aucun travail d'adoption restant ; préserver le contrat dans les lots suivants. | Contrat commun, course, démontage, timers, anti-double, focus, erreurs réseau/métier et tests positifs par surface. | 59 lignes `COVERED`, 2 réactions système `EXCEPTION_PROVEN`, zéro trou | Régression future ou nouveau consommateur contournant le runner. | `VERIFIED` |
| **R4-06** | **P0** | Plan RC4 §8.1, §8.3–8.4, §14.3–14.5 | Les `61` lignes sont traitées après les lots 4–5 : `59 COVERED`, `2 EXCEPTION_PROVEN`, `0 PARTIAL`, `0 GAP`. | Rouge ciblé par famille, registre courant détaillé dans `docs/rc4-mutation-inventory.md` | Lot 4 : matrice Atelier rouge puis `102/102`; lot 5 : architecture/support rouge `35 failed`, puis `76/76`; suite frontend verte | Toutes les lignes de l'inventaire ; confirmations de désactivation, suppression, archivage, révocation et code Board | Aucun correctif de mutation restant ; conserver la matrice au lot 8. | Erreurs sûres, conservation, réessai, anti-double, succès exact, focus ; E2E transversaux complétés au lot 8. | Inventaire `61/61`, zéro ligne sans état ni preuve | Régression E2E possible, couverte par R4-09 au lot 8. | `VERIFIED` |
| **R4-07** | **P1** | Plan RC4 §9.1–9.2, §12 lot 6 | Les pseudo-pluralisations, anciens libellés, rôles bruts, fallbacks d'enums et sections Diagnostic blanches ont été reproduits par des tests permanents avant correction. | Trois rouges permanents : terminologie `10/10 failed`, fallback enum `34` restitutions brutes, Diagnostic blanc `2/2 failed` ; commandes et sorties §6. | Accords `0/1/2`, cinq rôles, `33` pseudo-pluriels et `10` anciens libellés en échec ; puis `34` fallbacks bruts et deux sections Diagnostic blanches rendues. | Helpers français et libellés sûrs ; erreurs, filtres, confirmations, journaux, Board, administration et courriels ; tests existants alignés sur le glossaire sans changer les enums internes. | Tests permanents de source et DOM ; rôles/fallbacks sûrs ; Diagnostic absent si null/vide/blanc ; balayages obligatoires classifiés ; backend notifications/lignes. | Ciblés frontend `15/15`, `204/204` ; backend `2/2`, `26/26` ; builds, ESLint et Prettier des deux applications verts ; balayage pseudo-pluriels vide. | Les enums et clés restantes sont exclusivement types, logique, accès DTO/configuration et fixtures négatives ; aucun fallback brut de table de libellés ne subsiste. | `VERIFIED` |
| **R4-08** | **P1** | Plan RC4 §10.1–10.3, §14.6 | Le modèle Nginx hôte versionné ne contient aucune directive effective `X-Sentinel-Inheritance-Barrier`, aucun contrôle public `verify-public-headers.sh` n'existe et aucun test ne couvre l'héritage global ou l'unicité. Le modèle hôte ne contient que HSTS et masquage upstream. | `npm test -- src/middlewares/__tests__/securityHeaders.test.ts -t 'RC4 RED — versionne la barrière qui bloque les add_header globaux'` depuis `backend/` ; sortie détaillée §6 | Code `1` : `deploy/nginx/sentinel.conf.example` ne contient pas la directive exacte `add_header X-Sentinel-Inheritance-Barrier "";`. | `deploy/nginx/sentinel.conf.example` ; nouveau contrôle versionné sous `scripts/` ; test local Nginx ; `docs/runbook.md` ; contrôles CI/ops si nécessaire | Versionner la barrière au niveau HTTPS approprié, expliquer les autorités, vérifier `/login` et `/api/health`, occurrences et valeurs exactes, refuser l'en-tête interne ; documenter sauvegarde/application atomique/`nginx -t`/reload/validation/rollback, sans VPS. | Test local avec héritage global et upstream simulés ; `nginx -t` compatible 1.18 ; script public en environnement local ; tests négatifs doublon, mauvaise valeur et barrière exposée ; vérification externe différée. | `PENDING_EXECUTION[R4-08:GREEN_EVIDENCE]` | Sémantique subtile d'héritage `add_header`, incompatibilité Nginx 1.18, HSTS en double, barrière publique, script divulguant un secret, confusion preuve locale/VPS. | `RED_PROVEN` |
| **R4-09** | **P0** | Plan RC4 §5.2, §6.3, §7.3, §8.4, §14 | Les E2E ne cliquent pas le corps de carte ; ne prouvent ni géométrie haut/milieu/bas ni molette interne ; Board ne couvre que l'accès/session ; le cycle de vie ne vérifie pas motif sur les trois surfaces et dans l'historique. Échecs réseau/métier, doubles clics et récupérations sont incomplets. | Pas de scénario global au lot 0 : au lot 8, chaque parcours de §14 sera ajouté puis exécuté isolément avec `npx playwright test <fichier> -g '<interaction exacte>'` avant correction de ce parcours | Non exécuté au lot 0 conformément au §12. Chaque scénario devra échouer sur le comportement réellement absent, sans `force`, retry ni timeout arbitraire ; un scénario global ne localiserait pas l'interaction. | `frontend/e2e/incident-lifecycle.spec.ts` ; `board.spec.ts` ; `accessibility.spec.ts` ; `workshop-arbitration-mobile.spec.ts` ; `workshop-cancel-withdrawal.spec.ts` ; `workshop-zoom.spec.ts` ; fixtures E2E | Ajouter les parcours déterministes manquants sur vraie surface, avec attentes d'états observables et géométrie réelle ; compléter axe, responsive, clavier, focus et matrice de mutations. | Section 14 intégrale : carte/panneau, attente, correction, annulation, mutations transversales, sécurité/courriel ; desktop, mobile, zoom 200 %, axe zéro critique/sérieuse. | `PENDING_EXECUTION[R4-09:GREEN_EVIDENCE]` | Flakes, fixtures non représentatives, sélecteurs de substitution, interceptions qui ne prouvent pas la vraie API, tests trop globaux pour diagnostiquer. | `OPEN_RED_PENDING` |
| **R4-10** | **P1** | Plan RC4 §12 lots 9–10, §16 portes D–E, §18 | Aucune capture image n'est suivie ; la liste reste « à réaliser ». Des faits documentaires sont périmés, dont `38` migrations et `579` tests. La readiness RC3 admet que captures, VPS et SMTP restent externes. | Au lot 9, lancer des recherches ciblées avec `rg -n` sur chaque valeur/version/SHA périmé dans les documents concernés avant leur synchronisation ; aucune capture ne peut être testée avant déploiement autorisé | Non exécuté au lot 0 conformément au §12. Les valeurs déjà localisées constituent le périmètre, mais chaque contrôle documentaire devra d'abord retourner un résultat non vide ; les captures et faits externes resteront explicitement en attente. | `docs/release-readiness-rc4.md` ; `docs/dossier-projet/liste-captures-a-realiser.md` ; `docs/dossier-projet/corrections-dossier-final.md` ; runbook, dossier jury et documents citant des totaux/version/SHA | Recalculer tous les faits au SHA candidat, synchroniser readiness/runbook/dossier, préparer la liste exacte des captures post-déploiement et distinguer preuves locales, CI et externes. | Recherches de valeurs périmées ; validation liens/SHA/totaux ; revue terminale documentaire ; captures uniquement après GO déploiement sur RC4 réellement servie. | `PENDING_EXECUTION[R4-10:GREEN_EVIDENCE]` | Faits recopiés, total non disjoint, capture RC3 attribuée à RC4, preuve externe inventée, document mis à jour avant le SHA final. | `OPEN_RED_PENDING` |
| **R4-11** | **P0** | Plan RC4 §11, §14.3–14.6, §15 | Patrimoine RC3 présent à préserver : migrations 049/050, session Board sans expiration et révocable, correction v2 avec snapshots, arbitrages, suivi explicite, séparation motif/diagnostic, erreurs structurées, courriel multipart, redaction des secrets, SelectField et provenance OCI. Lacunes de preuve supplémentaires du diagnostic et les `16 GAP`/`11 EXCEPTION_TO_REVIEW` de l'inventaire sont détaillés en §7, notamment correction annoncée à tort appliquée, succès absents, modales fermées ou figées en erreur, faux succès reset et saisie Support perdue. | Aucun rouge générique valable pour un groupe d'invariants : baseline par `git diff --exit-code v1.0.0-rc.3 -- backend/migrations/` et recomptages §3 ; chaque défaut fonctionnel de §7 recevra sa commande rouge exacte avant correction | La baseline est verte (diff vide ; `1 146` tests recensés, suites locales exécutées vertes) et n'est pas présentée comme un rouge. Les lacunes de §7 restent ouvertes ; les regrouper sous une commande représentative violerait la règle d'interaction exacte. | `backend/migrations/049_*` et `050_*` ; tests Board auth/session ; tests correction/arbitrage PostgreSQL ; repository/service Atelier ; tests suivi et erreurs ; modèles courriel ; logs/redaction ; composant `SelectField` ; workflows/images OCI ; E2E attente/correction/annulation ; surfaces de l'inventaire | Ne modifier aucune migration ; compléter uniquement les preuves manquantes et corriger minimalement tout écart réellement reproduit, sans changer les permissions ou contrats métier. | Diff byte-identique migrations ; PostgreSQL réel et concurrence exactement un gagnant ; retraits de demandes par leur demandeur ; motifs obligatoires aux refus ; requête HTTP d'une ancienne session après révocation ; suivi explicite ; motif séparé sur Atelier/panneau/Board/historique ; erreurs sûres ; courriel HTML+texte avec lien correct ; logs sans cookie/JWT ; SelectField mesuré au viewport ; OCI et préflight registry-only ; cycles ciblés des lacunes d'inventaire ; SMTP externe après GO. | `PENDING_EXECUTION[R4-11:GREEN_EVIDENCE]` ; invariant migrations et socle de suites confirmés au lot 0 | Régression métier silencieuse, test unitaire confondu avec preuve HTTP/SQL/navigateur, concurrence non déterministe, SMTP réel faussement déclaré local, lacune de mutation oubliée, altération accidentelle d'une migration. | `OPEN_RED_PENDING` |

## 6. Registre exécutable des cycles rouge → vert

Les preuves de diagnostic initiales du lot 0 introduites ci-dessous ont été
exécutées sur le SHA `e5019eef374d580eca8d4f62af61bbd3135ceecb`, avant toute
correction produit. Les sondes de test temporaires ont été ajoutées par patch,
exécutées une à une, puis entièrement retirées par patch. Elles ne figurent
donc pas dans le commit documentaire cassé. Après retrait, les quatre fichiers
frontend concernés ont repassé `50/50` tests et le fichier backend ciblé
`15/15`. Ces contrôles prouvent le retour à la base, pas le vert des
corrections futures.

Commandes exactes de retour à la base, respectivement depuis `frontend/` et
`backend/` :

```bash
npm test -- src/components/__tests__/IncidentCard.test.tsx src/pages/__tests__/WorkshopDashboardPage.test.tsx src/components/__tests__/BoardIncidentGrid.test.tsx src/api/__tests__/errorMessages.test.ts
npx jest --selectProjects unit --runTestsByPath src/middlewares/__tests__/securityHeaders.test.ts
```

Les deux commandes ont retourné le code `0` : `4` fichiers et `50` tests
frontend passés ; `1` suite et `15` tests backend passés.

### R4-01 et R4-02 — clic réel hors du bouton de titre

Répertoire d'exécution : `frontend/`.

```bash
npm test -- src/components/__tests__/IncidentCard.test.tsx src/pages/__tests__/WorkshopDashboardPage.test.tsx
```

- code de sortie : `1` ;
- sortie utile : `2 failed` fichiers, `10 failed / 25 passed` tests ;
- interactions rouges permanentes et causes exactes :
  - clic sur `PRODUIT X45` dans la métadonnée : `onClick` reçu `0` fois ;
  - clic sur `Sécuriser la zone avant intervention.` dans la consigne :
    `onClick` reçu `0` fois ;
  - clic sur `Motif de mise en attente : Attente pièce détachée` :
    `onClick` reçu `0` fois ;
  - clic sur `Créé par Jean Dupont · Opérateur` dans le pied :
    `onClick` reçu `0` fois ;
  - absence du rôle `link` attendu pour l'activateur ;
  - les deux ouvertures page depuis les métadonnées ne créent aucun drawer ;
  - les deux scénarios de fermeture ne peuvent donc pas restaurer le focus ;
  - le bouton `Modification à arbitrer` ouvre la modale mais sélectionne aussi
    le dossier, contrairement à son indépendance contractuelle.

Le test historique trompeur a été renommé
`ouvre le dossier quand le titre visible est cliqué`. Les deux tests clavier
permanents utilisent `user.tab()` puis `user.keyboard('{Enter}')` ou
`user.keyboard('[Space]')` ; aucun clic synthétique ne remplace la touche.

Rouge navigateur réel, depuis la racine du dépôt avec Node `24.18.0` dans le
`PATH` :

```bash
DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh npm --prefix frontend run test:e2e -- e2e/incident-card-activation.spec.ts --grep 'ouvre le dossier depuis la métadonnée produit de la carte'
```

- code de sortie : `1` ;
- sortie utile : `1 failed` sous Chromium ;
- interaction : calcul de la `boundingBox()` du texte `E2E-CORRECTION` situé
  dans `.incident-card-meta`, puis `page.mouse.click()` en son centre ;
- assertion : le drawer
  `Détail de l'incident ligne 999, machine E2E-MCH-1` reste introuvable après
  `5 000 ms` ;
- nettoyage : aucun conteneur ni volume PostgreSQL résiduel.

#### Vert ciblé du lot 1

```bash
npm test -- src/components/__tests__/IncidentCard.test.tsx src/pages/__tests__/WorkshopDashboardPage.test.tsx
```

- code `0` ;
- `2` fichiers passés, `35/35` tests passés ;
- les mêmes nœuds hors titre ouvrent maintenant ; le titre reste couvert ;
- Entrée et Espace activent le lien réel ;
- l'`article` reste sans `role`/`tabIndex`, l'unique lien possède un vrai
  `href`, et aucun `a`/`button` n'en contient un autre ;
- étoile, modification et annulation appellent uniquement leur commande ;
- l'arbitrage ouvre sa modale avec zéro drawer ;
- fermeture par croix et par Échap : le même `HTMLAnchorElement` déclencheur
  retrouve exactement le focus.

Suite frontend complète :

```bash
npm test
```

- code `0` ;
- `54` fichiers passés, `476/476` tests passés.

Preuve Chromium dédiée :

```bash
DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh npm --prefix frontend run test:e2e -- e2e/incident-card-activation.spec.ts
```

- code `0`, `3/3` tests passés ;
- clic souris réel au centre de la métadonnée : drawer, produit et paramètre
  `incident` visibles ;
- navigation Tab réelle jusqu'au lien : `toBeFocused()` puis
  `outlineStyle != none` et `outlineWidth > 0` ;
- clics réels sur l'étoile puis sur `Modification à arbitrer` : zéro drawer,
  aucun paramètre `incident`, modale d'arbitrage visible ;
- aucun `force: true`, aucune activation par `.incident-card-open` dans ce
  scénario, aucun conteneur ou volume résiduel.

Parcours E2E historiques dont l'activateur a été migré vers le rôle `link` :

```bash
DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh npm --prefix frontend run test:e2e -- e2e/incident-lifecycle.spec.ts e2e/workshop-arbitration-mobile.spec.ts e2e/workshop-cancel-withdrawal.spec.ts
```

- code `0`, `4/4` tests passés ;
- cycle de vie, arbitrage mobile et retrait d'annulation restent verts ;
- aucun conteneur ni volume résiduel.

Contrôles statiques :

```bash
npm run lint
npm run format:check
npm run build
```

Les trois commandes ont retourné le code `0`. R4-01 et R4-02 passent à
`VERIFIED`. R4-09 reste ouvert pour ses autres scénarios du lot 8.

### R4-03 — recentrage et décalage dynamique

Les deux sondes unitaires exécutées au lot 0 avaient déjà prouvé séparément
le recentrage (`scrollBy({ behavior: "smooth", top: 432 })`) et l'offset inline
(`740px`). Au démarrage du lot 2, elles ont été remplacées par des tests
permanents couvrant tout le contrat.

#### Rouge permanent du lot 2

Répertoire d'exécution : `frontend/`.

```bash
npm test -- src/pages/__tests__/WorkshopDashboardPage.test.tsx src/pages/__tests__/incidentDrawerScroll.test.ts
```

- code de sortie : `1` ;
- sortie utile : `2` fichiers en échec, `7 failed / 9 passed` ;
- ouverture réelle depuis la métadonnée d'une carte basse : `scrollBy` attendu
  sans appel, reçu une fois avec `{ behavior: "smooth", top: 512 }` ;
- propriété inline attendue absente, reçue `0px` ;
- feuille de style sans `overscroll-behavior: contain` ni
  `scrollbar-gutter: stable` sur le corps ;
- source encore couplée au hook et à l'offset ; surcharge sous `1180px`
  contenant `max-height: none`, `overflow: visible` et
  `overflow-y: visible` ; contrat viewport
  `interactive-widget=resizes-content` absent ; keyframe contenant
  `translateX`.

Rouge Chromium réel, depuis la racine du dépôt, sans retry :

```bash
DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh npm --prefix frontend run test:e2e -- e2e/incident-detail-scroll.spec.ts --reporter=line
```

- code de sortie : `1` ;
- sortie utile : `7/7` scénarios en échec sous Chromium, puis nettoyage
  PostgreSQL/Docker complet ;
- carte haute, viewport `1440×900` : ouverture `scrollY 315→6`, drawer
  `top=374`, `bottom=1186`, corps `clientHeight=707`,
  `scrollHeight=1144`, propriété d'offset `0px` ;
- carte milieu : ouverture `scrollY 647→599`, drawer `top=76`, `bottom=888`,
  corps `707/1144`, offset `295px` ;
- carte basse : ouverture `scrollY 1019→975`, drawer `top=403`,
  `bottom=1215`, corps `707/1019`, offset `998px` ;
- scroll page : `480→720→560`; molette interne `scrollTop 0→240` avec page à
  `560`, puis, à la borne atteinte par la molette `scrollTop=436`, une molette
  supplémentaire conserve le corps à `436` mais déplace la page `560→880`
  parce que l'overscroll reste `auto` ;
- insertion à `640×720` : `innerWidth=640`,
  `document.scrollWidth=644`, drawer `x=36`, `right=644`, `width=608`,
  `top=310`, `bottom=1425.78125` ; le dépassement transitoire vient du
  `translateX(20px)` ;
- mobile `390×844` : `scrollY=982`, drawer `top=88.375`,
  `bottom=1707.96875`, corps `clientHeight=scrollHeight=1493`; la molette
  conserve `scrollTop=0`, déplace la page `982→1222` et pousse l'en-tête à
  `top=-151.625` ;
- resize desktop → mobile → desktop : mobile `top=590.375`,
  `bottom=2209.96875`, puis desktop `scrollY=190`, offset `174px`,
  `top=364`, `bottom=1176`, preuve d'une coordonnée devenue invalide.

Chaque ouverture Chromium calcule la boîte de `.incident-card-meta` et effectue
un vrai `page.mouse.click()` en son centre. Aucun test n'ouvre par le titre,
`.incident-card-open`, un callback, `force: true`, retry ou temporisation
arbitraire.

#### Architecture verte

- `useIncidentDrawerPosition.ts` est supprimé avec ses imports, refs, état,
  style inline, variable CSS, marge dynamique et tout recentrage d'ouverture ;
- le seul `requestAnimationFrame` conservé dans `WorkshopDashboardPage`
  séquence l'arbitrage automatique après rendu, sans lecture de géométrie ni
  scroll ;
- desktop : grille liste + colonne droite, drawer `position: sticky`,
  `top: 72px`, marge basse `16px`, `max-height` bornée en `vh` puis `dvh` ;
- l'en-tête est un enfant flex non scrollable ; le corps est l'autre enfant,
  avec `flex`, `min-height: 0`, `min-width: 0`, `overflow-y: auto`,
  `overscroll-behavior: contain` et `scrollbar-gutter: stable` ;
- sous `1180px`, le drawer devient un panneau viewport avec
  `inset: 72px 16px 16px`; la liste reste dans le flux mais devient invisible.
  Le document déclare `interactive-widget=resizes-content` et la réduction
  réelle du layout viewport Chromium de `390×844` à `390×500` vérifie que le
  panneau reste intégralement borné et scrollable. Cette preuve reproduit la
  contraction utile, sans prétendre qu'un clavier système réel a été ouvert ;
  aucune coordonnée JavaScript ne survit à un resize ;
- l'animation horizontale est supprimée ; l'ouverture du titre reçoit
  `focus({ preventScroll: true })` et la fermeture attend la synchronisation
  état/URL avant de refocaliser le lien exact de la carte ;
- le seed E2E fournit huit dossiers longs avec commentaire valide de
  `500` caractères et `display_order` explicite, afin de rendre les positions
  physiques haut/milieu/bas déterministes.

#### Vert ciblé et mesures navigateur

```bash
npm test -- src/components/__tests__/IncidentCard.test.tsx src/pages/__tests__/WorkshopDashboardPage.test.tsx src/pages/__tests__/incidentDrawerScroll.test.ts
```

- code `0`, `3` fichiers et `44/44` tests passés ;
- suppression du couplage, absence de recentrage, structure en-tête/corps,
  focus exact croix/Échap et invariants Lot 1 couverts.

Le test Chromium dédié ci-dessus a ensuite été exécuté trois fois
indépendamment, sans retry :

- exécution 1 : `7/7` passés en `12.1 s` ;
- exécution 2 : `7/7` passés en `11.6 s` ;
- exécution 3 : `7/7` passés en `11.7 s` ;
- les trois exécutions terminent par
  `nettoyage complet : aucun conteneur ni volume résiduel`.

Mesures vertes consignées :

- desktop haut/milieu/bas, `1440×900` : `scrollY` respectivement
  `315`, `647`, `1019`, inchangé par l'ouverture ; drawer identique
  `left=884`, `top=72`, `right=1324`, `bottom=884`, `width=440`,
  `height=812`, `document.scrollWidth=1440` ; corps `707/1184` en
  haut/milieu et `707/1037` en bas (`clientHeight/scrollHeight`) ;
- scroll page réel `524→764→604` : drawer toujours à `top=72` ; molette dans
  le corps `scrollTop 0→240` puis `476` sans modifier `scrollY=604`; à la borne
  atteinte par la molette, une seconde molette conserve exactement
  `scrollTop=476` et `scrollY=604`; retour interne exact à `0` sans déplacement
  de page ;
  en-tête, navigation, compteur et fermeture gardent exactement leurs boîtes ;
- zoom 200 %, `640×720` : dès l'insertion puis après stabilisation,
  `left=16`, `top=72`, `right=624`, `bottom=704`, `width=608`,
  `height=632`, `document.scrollWidth=640`; corps `553/1058` ;
- mobile `390×844` : `left=16`, `top=72`, `right=374`, `bottom=828`,
  `width=358`, `height=756`, `document.scrollWidth=390`; corps `629/1493`,
  molette `scrollTop 0→240` avec `scrollY=1528` inchangé ;
- viewport réduit à `390×500` : `left=16`, `top=72`, `right=374`,
  `bottom=484`, `width=358`, `height=412`; corps `285/1493`, molette
  `scrollTop 240→360` avec `scrollY=1528` inchangé ; topbar, navigation,
  compteur et fermeture restent tous dans le viewport ; le jeton
  `interactive-widget=resizes-content` est vérifié dans le navigateur ;
- resize `1440×900→390×844→1440×900` : géométries ci-dessus puis retour exact
  à `left=884`, `top=72`, `right=1324`, `bottom=884`, avec
  `scrollY=524` inchangé ;
- fermetures par croix (haut/bas) et Échap (milieu) : focus final sur les
  liens `A.incident-card-open` des cartes exactes `11`, `6` et `1`.

#### Non-régressions et balayages

- Lot 1 ciblé : `37/37` ; E2E carte : `3/3` ;
- E2E historiques panneau : `7/7` ;
- panneau ciblé : `13/13` ;
- suite frontend : `54` fichiers, `482/482` ;
- suite E2E Chromium complète : `44/44` en `44.8 s`, sans retry ;
- builds frontend/backend, typage des scripts backend, ESLint frontend/backend
  et Prettier frontend/backend : codes `0`.

Balayages exigés :

- `rg -n 'useIncidentDrawerPosition|detailOffsetTop|incident-detail-offset-top' frontend`
  retourne zéro occurrence ;
- `rg -n 'scrollBy|scrollIntoView' frontend/src/pages frontend/src/components frontend/src/hooks`
  ne retourne que quatre scrolls indépendants : élément actif et détail du
  journal dans `useHistoryData.ts`, détail de connaissance dans
  `WorkshopKnowledgePage.tsx`, bas de conversation dans `SupportChat.tsx` ;
- les occurrences de `incident-detail-drawer` sont classées ainsi :
  production dans `workshop.css` et `WorkshopDashboardPage.tsx`, contrats
  unitaires dans les deux tests de page/CSS, et observations navigateur dans
  les E2E carte, scroll, cycle de vie, retrait et zoom. Aucune n'est une
  coordonnée ou un second mécanisme de positionnement.

R4-03 passe à `VERIFIED`. R4-04 et tous les lots ultérieurs restent inchangés.

### R4-04 — motif courant sur le Board

Trois preuves rouges permanentes ont été ajoutées et exécutées avant toute
correction de production.

#### Rouges permanents du lot 3

PostgreSQL réel, depuis la racine :

```bash
backend/scripts/with-disposable-postgres.sh npm --prefix backend run test:integration -- --runTestsByPath src/integration/__tests__/boardWaitingReasonProjection.integration.test.ts
```

- code de sortie : `1` ;
- sortie : `1` suite en échec, `6 failed / 1 passed` sur `7` tests ;
- cause exacte : la vraie projection renvoie `undefined` pour
  `waiting_reason`, au lieu du motif distinctif complet ou de `null` ;
- les cas rouge couvrent aussi `PENDING` nul/espaces, `OPEN` adversarial,
  vrai service de mise en attente et ensemble exact des clés ;
- la preuve de lecture seule par snapshot PostgreSQL est déjà verte ;
- nettoyage final : aucun conteneur ni volume résiduel.

DOM frontend, depuis la racine :

```bash
npm --prefix frontend test -- src/components/__tests__/BoardIncidentGrid.test.tsx
```

- code de sortie : `1` ;
- sortie : `1` fichier, `3 failed / 11 passed` sur `14` tests ;
- interaction exacte : rendu d'une vraie carte Board `PENDING` portant
  `waiting_reason: "Attente pièce détachée RC4"` ;
- cause exacte : le statut « En attente » est présent, mais le DOM ne contient
  pas `Motif de mise en attente : Attente pièce détachée RC4` ; le bloc du
  motif long et la preuve de confidentialité échouent pour la même omission.

Chromium réel sur PostgreSQL E2E jetable, depuis la racine :

```bash
DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh npm --prefix frontend run test:e2e -- --project=chromium e2e/board-waiting-reason.spec.ts
```

- code de sortie : `1`, `1 failed` en `9.6 s` ;
- le navigateur crée l'incident déterministe, le rend urgent par la vraie UI,
  le technicien le prend en charge et le suspend avec
  `RC4 — attente pièce détachée — conservation historique` ;
- la carte et le panneau Atelier montrent le statut et le motif ;
- le vrai code Board ouvre le vrai Board, puis ses réglages isolent la carte
  `Ligne 999`, machine `E2E-MCH-1`, produit `E2E-RC4-WAITING-REASON` ;
- cause exacte : cette carte unique contient « En attente » mais pas
  `Motif de mise en attente : RC4 — attente pièce détachée — conservation historique` ;
- aucun mock réseau, injection DOM, accès DB depuis le test, screenshot comme
  assertion, `reload`, `waitForTimeout`, `force: true` ou retry ;
- nettoyage final : aucun conteneur ni volume résiduel.

#### Contrat et correction minimale

Le contrat incident Board passe de `17` à `18` champs. Liste publique exacte :

```text
id
line_id
line_number
machine_id
robot_label
head_number
state
current_product
is_taken
is_priority
responsible_comment
waiting_reason
status
display_order
created_at
updated_at
has_edit_arbitration
has_cancel_arbitration
```

Exemple anonymisé avant :

```json
{
  "id": 42,
  "line_number": "L01",
  "machine_id": "M-01",
  "status": "PENDING",
  "responsible_comment": "Sécuriser la zone.",
  "has_edit_arbitration": false,
  "has_cancel_arbitration": false
}
```

Après :

```json
{
  "id": 42,
  "line_number": "L01",
  "machine_id": "M-01",
  "status": "PENDING",
  "responsible_comment": "Sécuriser la zone.",
  "waiting_reason": "Attente pièce détachée",
  "has_edit_arbitration": false,
  "has_cancel_arbitration": false
}
```

La seule donnée nouvelle est `waiting_reason: string | null`. La requête
incidents reste un unique `SELECT`, sans jointure ni verrou ni mutation :

```sql
CASE
  WHEN status = 'PENDING'
   AND NULLIF(btrim(waiting_reason), '') IS NOT NULL
  THEN waiting_reason
  ELSE NULL
END AS waiting_reason
```

Cette forme utilise `btrim` seulement pour décider si la valeur est vide, puis
retourne la valeur source complète. Pour `OPEN`, pour toute valeur périmée, et
pour un motif nul/vide/espaces, le JSON contient explicitement `null`.

Le frontend étend son modèle partagé sans `any`, cast opportuniste ni modèle
parallèle. `BoardWaitingReason` ne rend rien hors `PENDING` ou pour un motif
normalisé vide. Le texte complet reste un vrai nœud DOM accessible, sans
`title` ni `aria-hidden`; un line-clamp CSS de deux lignes est uniquement
visuel. La carte reste un `article` de consultation sans bouton, lien,
formulaire ou commande privée.

Les données interdites restent absentes : `user_id`, identités et badges,
`taken_by_*`, `role`, `comment`, `diagnostic`, `intervention_note`,
`edit_request`, `cancel_request`, `cancel_request_reason`, `arbitration`,
`decision_reason`, historique, permissions et commandes.
`responsible_comment` et les deux booléens d'arbitrage étaient déjà publics.

#### Verts ciblés

```bash
npm --prefix backend test -- --runTestsByPath src/modules/workshop/__tests__/workshop.repository.test.ts
npm --prefix frontend test -- src/components/__tests__/BoardIncidentGrid.test.tsx src/utils/__tests__/boardUtils.test.ts
backend/scripts/with-disposable-postgres.sh npm --prefix backend run test:integration -- --runTestsByPath src/integration/__tests__/boardWaitingReasonProjection.integration.test.ts
DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh npm --prefix frontend run test:e2e -- --project=chromium e2e/board-waiting-reason.spec.ts
```

- repository : `1` suite, `9/9` ;
- frontend Board et utilitaires : `2` fichiers, `37/37` ;
- PostgreSQL réel : `1` suite, `7/7`, puis nettoyage complet ;
- Chromium : `1/1` en `35.7 s` lors de la validation finale, puis nettoyage
  complet.

Les sept tests PostgreSQL couvrent les dix obligations contractuelles :

1. `PENDING` avec motif de `1 000` caractères, égalité et longueur exactes ;
2. `PENDING` + `null` ;
3. `PENDING` + espaces seuls ;
4. `OPEN` + valeur périmée injectée directement ;
5. vrai `setPendingIncidentService` puis projection exacte ;
6. vrai `resumeIncidentService`, projection et stockage courant à `null` ;
7. événements `INCIDENT_SET_PENDING` et `INCIDENT_RESUMED` conservant le motif ;
8. diagnostic distinct sans repli et absent du JSON ;
9. snapshots `xmin`, données, dates et comptes d'événements identiques avant
   et après la lecture ;
10. enveloppe, ligne, métriques et `18` clés incidents exactes, sentinelles
    privées absentes.

Le test frontend couvre `PENDING` avec motif, nul et espaces, `OPEN` avec motif
périmé, ainsi que `CLOSED`, `CANCELED` et `INVALIDATED`. Il vérifie aussi un
motif de `1 000` caractères intégralement accessible, la borne CSS réelle,
l'absence de Diagnostic, de données d'identité et de tout contrôle interactif.

#### Parcours Chromium vert et actualisation réelle

Le parcours vert vérifie successivement :

1. création opérateur sur ligne `999`, machine `E2E-MCH-1`, tête `13`,
   distincte des fixtures existantes ;
2. priorité activée par un responsable, puis vraie connexion technicien ;
3. prise en charge et suspension avec le motif exact ;
4. motif et « En attente » visibles sur carte et panneau Atelier ;
5. session Board ouverte par le vrai code et carte identifiée par ligne,
   machine et produit ;
6. motif et statut visibles, mais commentaire privé, identités, badges,
   Diagnostic et commandes absents ;
7. reprise technicien, puis motif absent de la carte et du panneau Atelier ;
8. même carte Board toujours visible comme « Pris en charge », motif absent
   après une vraie réponse `GET /api/board/data` ;
9. événements « Suspendu » et « Reprise en cours » conservant respectivement
   `motif de mise en attente: …` et `motif levé: …`, jamais Diagnostic ;
10. clôture par le vrai workflow pour nettoyer fonctionnellement la donnée.

Le Board n'est pas présenté comme temps réel : il charge initialement, écoute
`focus`/`visibilitychange` et interroge toutes les `30 s` quand il est visible.
Les pages Atelier et Board du test utilisent des contextes distincts ; le test
ne prétend donc pas qu'un focus synthétique a eu lieu. Il remet le Board au
premier plan et attend la prochaine réponse réseau réelle, qui peut provenir
du polling visible. Le budget `90 s` permet ce contrat sans attente fixe ni
retry ; les exécutions vertes de `34.7 s`, `36.8 s` et `35.3 s` sont cohérentes
avec ce polling. La validation finale après isolation de la tête dédiée passe
également en `35.7 s`.

#### Non-régressions complètes

```bash
npm --prefix backend test
backend/scripts/with-disposable-postgres.sh npm --prefix backend run test:integration
npm --prefix frontend test
DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh npm --prefix frontend run test:e2e -- --project=chromium e2e/board.spec.ts e2e/board-waiting-reason.spec.ts e2e/incident-lifecycle.spec.ts
DISPOSABLE_PG_DB=sentinel_e2e backend/scripts/with-disposable-postgres.sh npm --prefix frontend run test:e2e -- --project=chromium
npm --prefix backend run build
npm --prefix frontend run build
npm --prefix backend run typecheck:scripts
npm --prefix frontend exec -- tsc --noEmit --project frontend/tsconfig.json
npm --prefix backend run lint
npm --prefix frontend run lint
npm --prefix backend run format:check
npm --prefix frontend run format:check
git diff --exit-code v1.0.0-rc.3 -- backend/migrations
git diff --check
```

- backend unitaire : `48` suites, `508/508` ;
- intégration PostgreSQL : `21` suites, `144/144` ;
- frontend : `54` fichiers, `490/490` ;
- groupe Board + nouveau parcours + cycle de vie : `4/4` en `48.6 s` ;
- Chromium complet : `45/45` en `1.6 min`, sans retry ;
- builds, typechecks, ESLint et Prettier : codes `0` ;
- migrations : exactement `001..050`, diff RC3 code `0` ;
- `git diff --check` : code `0` ;
- chaque wrapper PostgreSQL vert termine par
  `nettoyage complet : aucun conteneur ni volume résiduel` ; contrôle Docker
  final vide.

Incidents de validation consignés sans les masquer :

- premier build frontend après ajout du test : code `2`, déclarations
  `node:fs`/`node:path` absentes ; échappatoires locales documentées comme le
  test CSS existant, puis build vert ;
- première suite backend en sandbox : `506/508`, deux `listen EPERM` dus à
  l'interdiction du port local ; relance hors sandbox : `508/508` ;
- première intégration complète : `143/143` exécutés mais ancienne suite
  d'arbitrage non compilée à cause d'un cast devenu inutile avec le DTO ;
  suppression du cast, puis `144/144` ;
- première tentative verte du nouveau Chromium : plafond global `30 s`
  atteint à l'attente de rafraîchissement ; budget porté à `90 s`, sans retry
  ni délai fixe, puis parcours vert ;
- première tentative Chromium complète : Docker code `125` avant tout test,
  port aléatoire indisponible ; contrôle immédiat zéro résidu puis vraie suite
  `45/45` ;
- la revue finale a isolé la fixture du nouveau parcours de la tête `5` vers
  la tête dédiée `13`, sans changer l'interaction testée ; le ciblé (`1/1` en
  `35.7 s`), le groupe Board/cycle de vie (`4/4` en `48.6 s`) et Chromium
  complet (`45/45` en `1.6 min`) ont tous été rejoués sur cet état.

R4-04 passe à `VERIFIED`. R4-09 reste ouvert pour ses futurs scénarios.

### R4-05 — adoption de l'infrastructure de mutation

Répertoire d'exécution : `frontend/`.

```bash
runner_consumers="$(rg -l '\buseMutationRunner\b' src -g '*.ts' -g '*.tsx' -g '!**/__tests__/**' | rg -v '^src/components/ui/MutationFeedback.tsx$' || true)"
if [[ -z "$runner_consumers" ]]; then
  echo 'FAIL R4-05: useMutationRunner a 0 consommateur dans le code de production.' >&2
  exit 1
fi
printf '%s\n' "$runner_consumers"
```

- code de sortie : `1` ;
- sortie exacte :
  `FAIL R4-05: useMutationRunner a 0 consommateur dans le code de production.` ;
- cause : hors fichier de définition et tests, aucune surface de production ne
  référence le runner partagé. Le vert devra en plus prouver import, appel et
  cinq états sur de vraies mutations ; la recherche de texte seule ne suffira
  pas comme preuve finale.

Vert lot 4 réellement exécuté :

- la même commande retourne le code `0` et liste les quatre orchestrateurs
  Atelier de production : `CreateIncidentModal.tsx`, `IncidentDetailPanel.tsx`,
  `useIncidentActions.ts` et `WorkshopDashboardPage.tsx` ;
- la matrice rouge ciblée préalable a produit `6 failed`, `29 failed`,
  `49 passed` : absence de consommateurs, anciens runners/verrous, branches
  mortes, succès inexacts ou absents, confirmations incomplètes, fuite après
  démontage, timer volant le focus, erreurs inaccessibles et récupération
  incomplète ;
- après correction, la matrice ciblée étendue passe `8/8` fichiers et `102/102`
  tests ; la suite frontend passe `56/56`, `534/534` ;
- le runner partagé prouve verrou synchrone, course, démontage, nettoyage des
  timers, annonce accessible, conservation et refocus ;
- le Chromium complet passe `48/48`, dont les sept familles Atelier sur API
  réelle : création/édition, état, suivi, urgence, consigne, correction et
  annulation. L'unique interception négative de correction est retirée avant
  le réessai réel ;
- inventaire après lot 4 : `24 COVERED`, `14 PARTIAL`, `13 GAP`,
  `10 EXCEPTION_TO_REVIEW`.

R4-05 et R4-06 sont donc `PARTIALLY_VERIFIED_LOT4`. Leur fermeture complète
reste conditionnée au lot 5 :
`PENDING_EXECUTION[R4-05:GREEN_NON_WORKSHOP]` et
`PENDING_EXECUTION[R4-06:NON_WORKSHOP]`. R4-09 reste `OPEN_RED_PENDING` pour les
parcours hors matrice Atelier du lot 4.

Lot 5 exécuté :

- rouge ciblé `RemainingMutationArchitecture` + `SupportChat` :
  `35 failed`, couvrant les 18 surfaces sans runner, l'ancienne confirmation,
  les succès absents, le code Board sans confirmation et la saisie Support
  effacée avant succès ;
- vert ciblé étendu : `6/6` fichiers et `76/76` tests ;
- registre courant : `59 COVERED`, `2 EXCEPTION_PROVEN`, `0 PARTIAL`, `0 GAP` ;
- les deux exceptions sont exclusivement les réactions système à `401`, sans
  action utilisateur ni saisie ;
- `LegacyConfirmModal`, `submittingRef` et `savingPrefRef` sont supprimés ;
- révocation et changement du code Board conservent leur modale jusqu'au succès.

R4-05 et R4-06 passent à `VERIFIED`. R4-09 reste ouvert jusqu'au lot 8.

### R4-07 — pluralisation visible

Répertoire d'exécution : `frontend/`.

```bash
npm test -- src/api/__tests__/errorMessages.test.ts -t 'RC4 RED — pluralise naturellement le nombre d’incidents actifs'
```

- code de sortie : `1` ;
- sortie utile : `1 failed`, `14 skipped` ;
- assertion : la chaîne devait contenir `2 incidents actifs` ;
- valeur reçue :
  `Ce technicien a 2 incident(s) actif(s) en cours...` ;
- cause : le traducteur expose encore la pseudo-pluralisation interdite.

Le test temporaire du lot 0 ayant été retiré comme annoncé, sa relance au lot
6 sélectionne `0` test (`14 skipped`, code `0`) et n'est pas utilisée comme
preuve verte. Les tests permanents suivants ont d'abord été ajoutés et
réellement exécutés en rouge :

```bash
npm test -- src/utils/__tests__/userFacingTerminology.test.ts
```

- code `1`, `10/10 failed` ;
- accords `0`, `1`, `2` encore faux ;
- les cinq rôles sont bruts ou mal libellés ;
- `33` pseudo-pluralisations et `10` anciens libellés recensés dans les sources
  de production frontend/backend.

Après ce premier inventaire, le balayage obligatoire des rôles a localisé des
fallbacks visibles non sûrs. La garde permanente correspondante a elle aussi
été exécutée avant correction :

```bash
npm test -- src/utils/__tests__/userFacingTerminology.test.ts -t 'bannit les fallbacks qui restituent une enum d’événement brute'
```

- code `1` ;
- d'abord `6` lignes représentatives, puis garde généralisée : `34` fallbacks
  `ROLE/STATE/STATUS/EVENT_LABELS[...] ?? valeur_interne` ;
- les deux restitutions d'événements d'administration et les surfaces
  Atelier/Board/Historique/Connaissance étaient concernées.

Enfin, la règle « aucune section Diagnostic vide » est couverte par un vrai
rendu DOM :

```bash
npm test -- src/components/__tests__/IncidentDetailPanel.test.tsx src/components/__tests__/ReviewIncidentRequestModal.test.tsx -t 'ne rend aucune section Diagnostic pour une valeur vide ou blanche'
```

- code `1`, `2/2 failed` ;
- une valeur composée uniquement d'espaces rendait encore le libellé
  `Diagnostic` dans le panneau et dans l'arbitrage.

Vert ciblé du lot 6 :

```bash
npm test -- src/utils/__tests__/userFacingTerminology.test.ts src/api/__tests__/errorMessages.test.ts src/utils/__tests__/workshopHistory.test.ts src/utils/__tests__/incidentDiff.test.ts src/utils/__tests__/userSort.test.ts src/utils/__tests__/workshopFilters.test.ts src/components/__tests__/IncidentCard.test.tsx src/components/__tests__/IncidentDetailPanel.test.tsx src/components/__tests__/ReviewIncidentRequestModal.test.tsx src/components/__tests__/BoardIncidentGrid.test.tsx src/components/__tests__/IncidentMetricsBar.test.tsx src/pages/__tests__/WorkshopHistoryPage.test.tsx src/pages/__tests__/WorkshopJournalPage.test.tsx src/pages/__tests__/WorkshopKnowledgePage.test.tsx src/pages/__tests__/UserListPage.a11y.test.tsx
```

- code `0`, `15/15` fichiers et `204/204` tests ;
- la garde permanente seule est verte à `11/11` ;
- accords naturels pour `0`, `1` et plusieurs éléments ;
- glossaire complet, cinq rôles traduits et fallback générique sûr ;
- aucune table de libellés ne restitue sa valeur interne en fallback ;
- Diagnostic est conservé uniquement lorsqu'une vraie valeur non blanche
  existe.

Contrôles backend ciblés :

```bash
npm test -- --runInBand src/modules/lines/__tests__/lines.service.test.ts src/modules/notifications/__tests__/notifications.service.test.ts
```

- code `0`, `2/2` suites et `26/26` tests.

Les builds, ESLint et Prettier frontend/backend ont tous retourné le code `0`.
La suite frontend complète est réservée à la Porte B après le lot 7.

Classification des quatre balayages obligatoires :

- `.message` / `ApiResponseError` : transport API, narrowing vers le
  traducteur sûr, contexte du runner, ErrorBoundary masquée en production et
  fixtures négatives ; aucun rendu direct d'une erreur API ;
- clés internes : types/DTO, accès aux réglages, comparaisons et fixtures
  négatives ; `waiting_reason` est rendu seulement par sa valeur sous le
  libellé « Motif de mise en attente » ;
- pseudo-pluralisations : aucune occurrence, `rg` code `1` (ensemble vide) ;
- rôles : constantes de domaine, policies, requêtes, types, comparaisons et
  fixtures ; les sorties utilisateur passent par les helpers français et la
  garde anti-fallback.

R4-07 passe à `VERIFIED`.

### R4-08 — barrière Nginx versionnée

Répertoire d'exécution : `backend/`.

```bash
npm test -- src/middlewares/__tests__/securityHeaders.test.ts -t 'RC4 RED — versionne la barrière qui bloque les add_header globaux'
```

- code de sortie : `1` ;
- sortie utile : `1 failed`, `507 skipped` ;
- assertion : le modèle hôte devait contenir exactement
  `add_header X-Sentinel-Inheritance-Barrier "";` ;
- cause : la directive est absente de
  `deploy/nginx/sentinel.conf.example`.

Vert : `PENDING_EXECUTION[R4-08:GREEN_AFTER_LOT7]`, avec simulation locale de
l'héritage, unicité des en-têtes et absence de barrière publique encore
obligatoires.

### Cycles restant à ouvrir

| ID | Situation après le lot 0 | Preuve future |
| --- | --- | --- |
| R4-06 | Inventaire 61/61, 59 couvertes et 2 exceptions système prouvées | `VERIFIED` |
| R4-09 | Lacunes E2E confirmées statiquement ; aucun scénario de substitution accepté | `PENDING_EXECUTION[R4-09:RED_GREEN_E2E]` |
| R4-10 | Valeurs documentaires périmées confirmées ; captures externes non inventées | `PENDING_EXECUTION[R4-10:RED_GREEN_DOCUMENTATION]` |
| R4-11 | Baseline migrations et suites exécutée ; lacunes de §7 toujours ouvertes | `PENDING_EXECUTION[R4-11:TARGETED_RED_GREEN_AND_EXTERNAL]` |

## 7. Sous-matrice de non-régression R4-11

Cette sous-matrice empêche qu'un contrat présent en RC3 ou une lacune de preuve
détectée au diagnostic soit perdu dans les lots transversaux.

| Contrat ou lacune | Couche de preuve minimale | Situation au diagnostic RC3 | Preuve RC4 | État |
| --- | --- | --- | --- | --- |
| Migrations 049/050 append-only et 001..050 byte-identiques | Diff Git contre le tag, migration depuis base vierge et upgrade pertinent sur PostgreSQL jetable | Présent ; diff initial vide | `git diff --exit-code v1.0.0-rc.3 -- backend/migrations/` initial : code `0` ; preuve finale à répéter | `BASELINE_VERIFIED_FINAL_PENDING` |
| Session Board sans expiration automatique et révocable | Unité JWT + intégration PostgreSQL + HTTP | Contrat et tests partiels présents | `PENDING_EXECUTION[R4-11:BOARD_SESSION]` | `OPEN` |
| Ancienne session Board refusée après révocation | Requête HTTP authentifiée avec jeton/session émis avant la révocation | Lacune supplémentaire : pas de preuve HTTP dédiée | `PENDING_EXECUTION[R4-11:BOARD_OLD_SESSION_HTTP]` | `OPEN_TEST_GAP` |
| Payload correction v2 et snapshot avant/après sous verrou | Unité sérialisation + intégration PostgreSQL réelle | Présent | `PENDING_EXECUTION[R4-11:CORRECTION_V2]` | `OPEN` |
| Retrait de demande de correction par son demandeur | Service/permissions + PostgreSQL + parcours utilisateur | Lacune supplémentaire : pas de preuve dédiée | `PENDING_EXECUTION[R4-11:CORRECTION_WITHDRAWAL]` | `OPEN_TEST_GAP` |
| Motif obligatoire au refus de correction | Validation + PostgreSQL + modale conservée en erreur | Présent | `PENDING_EXECUTION[R4-11:CORRECTION_REJECTION_REASON]` | `OPEN` |
| Concurrence correction : exactement un gagnant | Deux transactions réellement concurrentes sur PostgreSQL | Lacune supplémentaire : preuve absente | `PENDING_EXECUTION[R4-11:CORRECTION_CONCURRENCY]` | `OPEN_TEST_GAP` |
| Demande et retrait d'annulation par le demandeur ; refus avec motif obligatoire ; arbitrage concurrent avec exactement un gagnant | Permissions + PostgreSQL réellement concurrent + E2E multi-rôle | Présents, à revalider séparément | `PENDING_EXECUTION[R4-11:CANCELLATION]` | `OPEN` |
| Suivi uniquement explicite | Repository/service + E2E de chaque mutation sensible | Présent | `PENDING_EXECUTION[R4-11:FOLLOW_EXPLICIT]` | `OPEN` |
| Séparation `waiting_reason` / `diagnostic` | Migration, repository, Atelier, panneau, Board, Historique | Modèle présent ; panneau/Board et cycle reprise incomplets | `PENDING_EXECUTION[R4-11:WAITING_REASON_SEPARATION]` | `OPEN_TEST_AND_UI_GAP` |
| Erreur publique structurée et traduction sûre | Contrôleurs + tests négatifs DOM | Présent | `PENDING_EXECUTION[R4-11:PUBLIC_ERRORS]` | `OPEN` |
| Courriel multipart HTML + texte, lien correct et aucune image distante obligatoire | Unité de rendu/envoi, assertions du lien et réception SMTP réelle | Construction présente ; lien à revalider ; SMTP réel externe | `PENDING_EXECUTION[R4-11:MULTIPART_EMAIL_LOCAL]` ; SMTP : `PENDING_EXTERNAL_AUTHORIZATION` | `OPEN_EXTERNAL_PART` |
| Aucun cookie/JWT dans les logs | Tests de redaction et balayage des sorties | Présent | `PENDING_EXECUTION[R4-11:LOG_REDACTION]` | `OPEN` |
| SelectField borné au viewport | Test de composant + rectangles réels en navigateur à plusieurs positions/zooms | Tests simulés seulement | `PENDING_EXECUTION[R4-11:SELECTFIELD_GEOMETRY]` | `OPEN_BROWSER_GAP` |
| Provenance d'image OCI | Build images, labels et revision exacte | Présent | `PENDING_EXECUTION[R4-11:OCI_PROVENANCE]` | `OPEN` |
| Préflight registry-only | Test shell/Compose versionné | Présent | `PENDING_EXECUTION[R4-11:REGISTRY_PREFLIGHT]` | `OPEN` |

### 7.1 Lacunes supplémentaires issues de l'inventaire des mutations

Ces lignes font partie de R4-11 afin qu'aucun écart découvert par le balayage
exhaustif du lot 0 ne disparaisse derrière les six défauts rouges prioritaires.
Elles recoupent R4-06, mais ne sont pas déclarées corrigées : chaque interaction
devra recevoir son propre rouge exact avant modification.

| Lacune supplémentaire | Interactions comptées | Situation RC3 observée | Preuve future minimale | État |
| --- | ---: | --- | --- | --- |
| Proposition de correction annoncée comme déjà appliquée | 1 | Le mode `requestOnly` affiche `Modification appliquée.` au lieu de décrire une demande créée | Test de la soumission `requestOnly`, succès exact et absence du faux message | `OPEN_TEST_GAP` |
| Succès silencieux Atelier | 2 | Retrait d'une demande de correction et retrait d'une consigne sans message métier | Tests de succès `role="status"` et de récupération en erreur pour les deux déclencheurs | `OPEN_TEST_GAP` |
| Compte désactivé ou supprimé | 2 | Désactivation sans avertissement dédié et risque d'état partiel ; suppression sans succès visible | Confirmation adaptée, atomicité/rafraîchissement sûr, succès exact et erreurs conservant la modale | `OPEN_TEST_GAP` |
| Archivage simple ou forcé d'une ligne | 2 | L'erreur absorbée sous `AdminPasswordConfirmModal` laisse les deux parcours figés en pending | Deux rouges d'erreur, modale maintenue, bouton réutilisable, un seul appel et succès exact | `OPEN_TEST_GAP` |
| Succès silencieux dans les réglages et tâches Admin | 4 | Préférences de notification, activation Board, désactivation Board et traitement d'une demande de reset n'annoncent pas le résultat | Tests par interaction sur message précis, pending, erreur persistante et focus | `OPEN_TEST_GAP` |
| Changement de code Board révoquant des sessions | 1 | Avertissement inline mais aucune confirmation dédiée avant la mutation déconnectante | Rouge sur soumission directe, puis confirmation accessible et anti-double | `OPEN_TEST_GAP` |
| Révocation de sessions | 1 | L'appelant ferme la modale avant l'appel API et perd le mot de passe en cas d'échec | Rouge réseau/métier prouvant fermeture et perte, puis modale/saisie conservées | `OPEN_TEST_GAP` |
| Demande de réinitialisation Atelier | 1 | Le `finally` ferme la modale et affiche le succès même lorsque l'API échoue | Rouge d'échec exact, absence de faux succès, saisie et réessai conservés | `OPEN_TEST_GAP` |
| Envoi Support Admin et Atelier | 2 | Le compositeur efface le message avant l'appel et ne le restaure pas en échec | Rouge partagé sur les deux services, texte identique après erreur, focus et réessai | `OPEN_TEST_GAP` |
| Exceptions encore non formalisées | 11 | Accusé de consultation ; login/setup/logout ; accès/quitter Board ; réactions système aux `401` ; stockage local Board | Justification de sûreté ligne par ligne et tests ciblés des invariants retenus | `OPEN_EXCEPTION_REVIEW` |

Le décompte des neuf premières lignes est exactement celui des `16 GAP` de
`docs/rc4-mutation-inventory.md`; la dernière couvre ses
`11 EXCEPTION_TO_REVIEW`.

## 8. Suivi de la Porte A

La Porte A ne peut être déclarée franchie que lorsque chaque ligne ci-dessous
est soutenue par un fait local consigné.

| Critère Porte A | Preuve | État |
| --- | --- | --- |
| Branche exacte | `release/v1.0.0-rc4`, créée depuis `origin/main` au SHA immuable | `VERIFIED_BASELINE` |
| Matrice `R4-01..R4-11` complète | Section 5 : onze lignes, tous les champs contractuels renseignés ; les preuves futures restent explicitement ouvertes | `VERIFIED_CONTRACT` |
| Inventaire des mutations initialisé | `docs/rc4-mutation-inventory.md` produit par balayage du code : `61` lignes, `34 PARTIAL`, `16 GAP`, `11 EXCEPTION_TO_REVIEW` | `VERIFIED_BASELINE` |
| Écarts RC3 confirmés dans le code | Diagnostic statique validé par le propriétaire ; détails section 5 | `VERIFIED_DIAGNOSTIC` |
| Rouge R4-01 réellement exécuté | Registre §6 : clic sur la métadonnée, code `1`, `0` ouverture | `RED_PROVEN` |
| Rouge R4-03 réellement exécuté | Registre §6 : recentrage code `1` et offset inline code `1` | `RED_PROVEN` |
| Rouge R4-04 réellement exécuté | Registre §6 : motif Board introuvable, code `1` | `RED_PROVEN` |
| Rouge R4-05 réellement exécuté | Registre §6 : zéro consommateur de production, code `1` | `RED_PROVEN` |
| Rouge R4-07 réellement exécuté | Registre §6 : pseudo-pluralisation reçue, code `1` | `RED_PROVEN` |
| Rouge R4-08 réellement exécuté | Registre §6 : directive effective absente du modèle, code `1` | `RED_PROVEN` |
| Aucune migration prévue | RC4 interdit toute migration 051 ; diff initial 001..050 vide | `VERIFIED_BASELINE` |
| Terminologie figée | Section 4.1 | `VERIFIED_CONTRACT` |
| Autorité Nginx figée | Section 4.2 | `VERIFIED_CONTRACT` |
| Plans externes préservés | Seules exceptions hors suivi autorisées, non ignorées ; SHA-256 RC3 `861dc523…c822`, RC4 `31f40aa3…f4d2b` inchangés | `VERIFIED_BASELINE` |

**Décision Porte A : `FRANCHIE AU LOT 0`.** Cette décision valide uniquement le
contrat, l'inventaire et les défauts rouges exigés. Tous les
`PENDING_EXECUTION` des lots futurs restent non prouvés ; la Porte B et le GO
release demeurent fermés.

## 9. Contrôles de fin de lot 0

Contrôles exécutés sur l'index avant le commit documentaire :

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Branche, base et upstream | `git branch --show-current` et `git rev-parse HEAD @{upstream}` | Branche `release/v1.0.0-rc4` ; HEAD et upstream `e5019eef374d580eca8d4f62af61bbd3135ceecb` |
| État et périmètre indexé | `git status --short --untracked-files=all` et `git diff --cached --name-status` | Exactement deux ajouts indexés : `docs/rc4-mutation-inventory.md`, `docs/release-readiness-rc4.md` ; seuls les deux plans restent hors suivi |
| Espaces et index | `git diff --cached --check` puis `git diff --check` | Sorties vides, codes `0` |
| Migrations | `git diff --exit-code v1.0.0-rc.3 -- backend/migrations/` | Sortie vide, code `0` ; toujours `001..050` |
| Sondes temporaires retirées | `git diff --exit-code HEAD -- frontend/src/components/__tests__/IncidentCard.test.tsx frontend/src/pages/__tests__/WorkshopDashboardPage.test.tsx frontend/src/components/__tests__/BoardIncidentGrid.test.tsx frontend/src/api/__tests__/errorMessages.test.ts backend/src/middlewares/__tests__/securityHeaders.test.ts` puis `rg -n 'RC4 RED' frontend/src backend/src` | Diff vide, code `0` ; recherche vide, code `1` attendu ; aucune sonde restante |
| Plans externes | `git check-ignore -v -- Plan-RC3-Sentinel.md Plan-RC4-Sentinel.md` puis `sha256sum Plan-RC3-Sentinel.md Plan-RC4-Sentinel.md` | Ignore vide, code `1` attendu ; hashes inchangés ; aucun plan indexé |
| Structure documentaire | Comptage des lignes/états de l'inventaire, des onze lignes R4 et des séparateurs de tableaux | `61 = 34 + 16 + 11`, onze lignes R4, aucune ligne de tableau mal formée |
| Revue du diff | `git diff --cached --name-status`, `--stat` et lecture intégrale des deux documents | Deux fichiers ajoutés seulement ; aucune source, migration, configuration ou permission modifiée |

Commit attendu par le contrat, uniquement lorsque la Porte A est effectivement
satisfaite :

```text
docs: establish rc4 correction and evidence contracts
```

Aucun push, PR, merge, tag, release, build de release ou accès VPS n'est
autorisé par ce document.
