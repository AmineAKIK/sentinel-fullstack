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
| **R4-01** | **P0** | Plan RC4 §5.1–5.2, §14.1 | `IncidentCard` ouvre uniquement par le bouton contenant le titre. Le corps, les métadonnées, le pied, la consigne et le motif ne portent pas l'activation principale ; le focus n'est pas restauré exactement sur le déclencheur après fermeture. | `npm test -- src/components/__tests__/IncidentCard.test.tsx -t 'RC4 RED — ouvre le dossier quand la métadonnée produit est cliquée'` depuis `frontend/` ; sortie détaillée §6 | Code `1` : le clic réel sur la métadonnée produit laisse `onClick` à `0` appel au lieu de transmettre l'incident. | `frontend/src/components/IncidentCard.tsx` ; `frontend/src/components/__tests__/IncidentCard.test.tsx` ; `frontend/src/pages/WorkshopDashboardPage.tsx` ; styles de carte ; E2E Atelier concernés | Conserver l'`article`, ajouter un vrai lien/bouton sémantique étiré couvrant toute zone non interactive, placer les commandes indépendantes au-dessus, éviter toute imbrication interactive, rendre le focus visible et restaurer le déclencheur exact. | Composant : titre, métadonnée, consigne, motif, pied, zone blanche, `Entrée`, `Espace`, focus retour, absence d'imbrication ; étoile et Arbitrer n'ouvrent pas. E2E : vrai clic corps et clavier. | `PENDING_EXECUTION[R4-01:GREEN_EVIDENCE]` | Imbrication interactive, propagation étoile/arbitrage, doublon lecteur d'écran, ordre d'empilement, restauration sur la mauvaise carte. | `RED_PROVEN` |
| **R4-02** | **P0** | Plan RC4 §0, §5.2, §13 | Le test nommé comme un clic sur la carte exécute `getByRole('button', { name: /ouvrir incident/i })` ; le test clavier simule également un clic. Les E2E ciblent `.incident-card-open`. Ces tests donnent une preuve positive d'une autre interaction. | Même commande rouge que R4-01 sur la métadonnée réelle ; après retrait de la sonde, la suite historique `IncidentCard` est restée verte dans le contrôle ciblé `50/50` | La nouvelle interaction réelle échoue avec `0` ouverture alors que les tests historiques de substitution restent verts : leurs assertions portent donc sur un autre déclencheur. | `frontend/src/components/__tests__/IncidentCard.test.tsx` ; E2E Atelier et cycle de vie qui ciblent `.incident-card-open` | Remplacer les interactions de substitution par des sélecteurs sémantiques et des clics/événements clavier sur la vraie zone annoncée, sans affaiblir les assertions. | Test négatif démontrant l'écart ancien ; tests corps/titre distincts ; E2E sur métadonnée ou coordonnée blanche ; assertions zéro ouverture depuis les commandes indépendantes. | `PENDING_EXECUTION[R4-02:GREEN_EVIDENCE]` | Faux vert conservé par un nom trompeur, sélecteur CSS trop permissif, clic E2E intercepté ou forcé. | `RED_PROVEN` |
| **R4-03** | **P0** | Plan RC4 §6.1–6.3, §14.1 | Chaîne dynamique encore active : `useIncidentDrawerPosition` → `detailOffsetTop` → `--incident-detail-offset-top` → `margin-top`, avec recentrage `window.scrollBy`. Sticky, hauteur bornée et scroll interne n'annulent pas ce couplage. | Deux commandes Vitest exactes sur `WorkshopDashboardPage.test.tsx`, l'une sur le recentrage et l'autre sur la variable inline ; voir §6 | Codes `1` : l'ouverture de la carte basse appelle `scrollBy({ behavior: 'smooth', top: 432 })` et pose `--incident-detail-offset-top: 740px` au lieu de supprimer ces deux couplages. | `frontend/src/hooks/useIncidentDrawerPosition.ts` ; `frontend/src/pages/WorkshopDashboardPage.tsx` ; `frontend/src/components/IncidentDetailPanel.tsx` ; `frontend/src/styles/pages/workshop.css` ; tests page/panneau ; E2E Atelier | Supprimer hook, import, état/prop `detailOffsetTop`, variable CSS et marge dynamique ; sticky à `top` stable, hauteur viewport, en-tête visible, corps scrollable, `overscroll-behavior: contain`, `scrollbar-gutter: stable`, aucun recentrage artificiel. | Unité/composant sur suppression du couplage ; navigateur `1440×900` carte haut/milieu/bas, longue liste, panneau haut, molette bas/haut, scroll page ; mobile `390×844`, zoom 200 %, clavier et focus retour ; rectangles dans viewport. | `PENDING_EXECUTION[R4-03:GREEN_EVIDENCE]` | Containing block cassant `sticky`, double scroll mobile, clavier virtuel, panneau inaccessible en bas de liste, test de géométrie simulé ou flake. | `RED_PROVEN` |
| **R4-04** | **P1** | Plan RC4 §7.1–7.3, §14.2 | `waiting_reason` n'est ni projeté par la requête Board, ni présent dans le type public, ni rendu. Aucun test Board ne vérifie motif courant, disparition après reprise et conservation historique. | `npm test -- src/components/__tests__/BoardIncidentGrid.test.tsx -t 'RC4 RED — affiche le motif courant pour un incident en attente'` depuis `frontend/` ; sortie détaillée §6 | Code `1` : le DOM contient le statut `PENDING`/« En attente », mais aucun texte `Motif de mise en attente : Attente pièce détachée`. | `backend/src/modules/workshop/workshop.repository.ts` et types/projection Board ; tests repository/intégration ; `frontend/src/types/workshop.ts` ; `frontend/src/components/board/BoardIncidentGrid.tsx` ; `BoardIncidentGrid.test.tsx` ; `frontend/e2e/board.spec.ts` et cycle de vie | Ajouter uniquement `waiting_reason` à la projection et au type public Board ; rendre le libellé si `status === PENDING` et motif non vide, valeur complète accessible ; ne projeter aucune donnée privée supplémentaire. | Rouge frontend Board ; PostgreSQL réel sur projection minimale et valeur nulle/absente hors `PENDING` ; E2E attente → Atelier/panneau/Board visibles → reprise → disparition des trois surfaces → historique conservé. | `PENDING_EXECUTION[R4-04:GREEN_EVIDENCE]` | Fuite de diagnostic ou identité privée, motif périmé après reprise, troncature inaccessible, confusion état courant/historique. | `RED_PROVEN` |
| **R4-05** | **P0** | Plan RC4 §8.1–8.2, §12 lots 4–5, §14.5 | `useMutationRunner` n'a aucun import de production et n'est consommé que par son propre test. Les mutations utilisent en parallèle `runSimple`, `runPanelAction`, refs et états locaux ; l'existence d'une abstraction isolée ne prouve aucune adoption. | Contrat shell exact de recherche des consommateurs de production, depuis `frontend/` ; voir §6 | Code `1` et message exact `FAIL R4-05: useMutationRunner a 0 consommateur dans le code de production.` | `frontend/src/components/ui/MutationFeedback.tsx` ; hooks/actions Atelier ; modales incident ; pages Administration/Auth/Board/Support ; `docs/rc4-mutation-inventory.md` comme périmètre exhaustif | Choisir un unique contrat partagé léger, prouver ses imports en production, brancher d'abord toutes les mutations Atelier puis toutes les autres surfaces, documenter seulement les exceptions sûres login/logout et accusé silencieux. | Tests contractuels communs prêt/confirmation/pending/succès/échec/récupération ; une requête sur double clic ; focus ; erreurs réseau/métier ; tests de chaque ligne de l'inventaire et E2E représentatifs par famille. | `PENDING_EXECUTION[R4-05:GREEN_EVIDENCE]` | Migration partielle créant doubles messages, verrouillage incohérent, perte de focus, abstraction trop large, lignes oubliées hors inventaire. | `RED_PROVEN` |
| **R4-06** | **P0** | Plan RC4 §8.1, §8.3–8.4, §14.3–14.5 | Les `61` lignes de l'inventaire sont classées : `16 GAP`, dont révocation fermant une modale avant la réponse, code Board sans confirmation adaptée, faux ou absents succès, archivage figé en erreur et saisie Support perdue ; `11` exceptions restent à formaliser. Les lacunes supplémentaires sont aussi figées sous R4-11 en §7. | Pas de commande globale admise : aux lots 4–5, chaque interaction nécessitant une correction (`GAP` ou `PARTIAL`) recevra son test ciblé et sa commande exacte avant correction ; une exception non corrigée devra être justifiée et prouvée sûre ; registre §6 | Non exécuté au lot 0 conformément à la liste obligatoire du §12. Un rouge « représentatif » commun serait invalide car il substituerait une interaction à une autre ; les causes statiques de chaque ligne sont déjà consignées dans l'inventaire. | Toutes les lignes de `docs/rc4-mutation-inventory.md`, notamment `AdminSettingsPage.tsx`, pages/composants Support, Auth et Board, modales de clôture/invalidation/annulation/archivage/comptes | Appliquer les cinq états, anti-double, message métier sûr, conservation saisie/modale/focus en échec ; confirmations accessibles pour clôture, invalidation, annulation définitive, suppression, désactivation, archivage, révocation et réglage déconnectant. | Par famille : erreur métier, erreur réseau, modale ouverte, saisie identique, bouton réutilisable, aucune clé brute, double clic = un appel, succès exact et focus restauré ; E2E des mutations transversales. | `PENDING_EXECUTION[R4-06:GREEN_EVIDENCE]` | Action irréversible sans confirmation, fermeture optimiste, champs perdus, secret/erreur technique visible, double envoi, confirmations empilées. | `OPEN_RED_PENDING` |
| **R4-07** | **P1** | Plan RC4 §9.1–9.2, §12 lot 6 | Des pseudo-pluralisations visibles subsistent dans filtres, confirmations et erreurs. `formatEventActor` restitue directement `MAINTENANCE` et son test exige cette fuite ; certains journaux retombent sur les enums brutes. | `npm test -- src/api/__tests__/errorMessages.test.ts -t 'RC4 RED — pluralise naturellement le nombre d’incidents actifs'` depuis `frontend/` ; sortie détaillée §6 | Code `1` : attendu `2 incidents actifs`, reçu `Ce technicien a 2 incident(s) actif(s) en cours...`. | `frontend/src/components/ArchiveLineConfirmModal.tsx` ; `frontend/src/utils/workshopHistory.ts` et test ; composants/confirmations/filtres trouvés par balayage ; traducteurs d'erreurs ; modèles de courriel backend | Centraliser les accords français utiles, appliquer le glossaire, traduire tous les rôles, masquer Diagnostic sans valeur réelle et éliminer toute restitution brute sans modifier les enums internes. | Tests `0/1/2`, tous rôles et fallback sûr ; tests négatifs DOM/courriels contre pseudo-pluriels, clés `snake_case`, SQL et enums ; E2E/captures des surfaces visibles. | `PENDING_EXECUTION[R4-07:GREEN_EVIDENCE]` | Remplacement aveugle des chaînes internes, accords incomplets, fallback réintroduisant une enum, divergence courriel/DOM. | `RED_PROVEN` |
| **R4-08** | **P1** | Plan RC4 §10.1–10.3, §14.6 | Le modèle Nginx hôte versionné ne contient aucune directive effective `X-Sentinel-Inheritance-Barrier`, aucun contrôle public `verify-public-headers.sh` n'existe et aucun test ne couvre l'héritage global ou l'unicité. Le modèle hôte ne contient que HSTS et masquage upstream. | `npm test -- src/middlewares/__tests__/securityHeaders.test.ts -t 'RC4 RED — versionne la barrière qui bloque les add_header globaux'` depuis `backend/` ; sortie détaillée §6 | Code `1` : `deploy/nginx/sentinel.conf.example` ne contient pas la directive exacte `add_header X-Sentinel-Inheritance-Barrier "";`. | `deploy/nginx/sentinel.conf.example` ; nouveau contrôle versionné sous `scripts/` ; test local Nginx ; `docs/runbook.md` ; contrôles CI/ops si nécessaire | Versionner la barrière au niveau HTTPS approprié, expliquer les autorités, vérifier `/login` et `/api/health`, occurrences et valeurs exactes, refuser l'en-tête interne ; documenter sauvegarde/application atomique/`nginx -t`/reload/validation/rollback, sans VPS. | Test local avec héritage global et upstream simulés ; `nginx -t` compatible 1.18 ; script public en environnement local ; tests négatifs doublon, mauvaise valeur et barrière exposée ; vérification externe différée. | `PENDING_EXECUTION[R4-08:GREEN_EVIDENCE]` | Sémantique subtile d'héritage `add_header`, incompatibilité Nginx 1.18, HSTS en double, barrière publique, script divulguant un secret, confusion preuve locale/VPS. | `RED_PROVEN` |
| **R4-09** | **P0** | Plan RC4 §5.2, §6.3, §7.3, §8.4, §14 | Les E2E ne cliquent pas le corps de carte ; ne prouvent ni géométrie haut/milieu/bas ni molette interne ; Board ne couvre que l'accès/session ; le cycle de vie ne vérifie pas motif sur les trois surfaces et dans l'historique. Échecs réseau/métier, doubles clics et récupérations sont incomplets. | Pas de scénario global au lot 0 : au lot 8, chaque parcours de §14 sera ajouté puis exécuté isolément avec `npx playwright test <fichier> -g '<interaction exacte>'` avant correction de ce parcours | Non exécuté au lot 0 conformément au §12. Chaque scénario devra échouer sur le comportement réellement absent, sans `force`, retry ni timeout arbitraire ; un scénario global ne localiserait pas l'interaction. | `frontend/e2e/incident-lifecycle.spec.ts` ; `board.spec.ts` ; `accessibility.spec.ts` ; `workshop-arbitration-mobile.spec.ts` ; `workshop-cancel-withdrawal.spec.ts` ; `workshop-zoom.spec.ts` ; fixtures E2E | Ajouter les parcours déterministes manquants sur vraie surface, avec attentes d'états observables et géométrie réelle ; compléter axe, responsive, clavier, focus et matrice de mutations. | Section 14 intégrale : carte/panneau, attente, correction, annulation, mutations transversales, sécurité/courriel ; desktop, mobile, zoom 200 %, axe zéro critique/sérieuse. | `PENDING_EXECUTION[R4-09:GREEN_EVIDENCE]` | Flakes, fixtures non représentatives, sélecteurs de substitution, interceptions qui ne prouvent pas la vraie API, tests trop globaux pour diagnostiquer. | `OPEN_RED_PENDING` |
| **R4-10** | **P1** | Plan RC4 §12 lots 9–10, §16 portes D–E, §18 | Aucune capture image n'est suivie ; la liste reste « à réaliser ». Des faits documentaires sont périmés, dont `38` migrations et `579` tests. La readiness RC3 admet que captures, VPS et SMTP restent externes. | Au lot 9, lancer des recherches ciblées avec `rg -n` sur chaque valeur/version/SHA périmé dans les documents concernés avant leur synchronisation ; aucune capture ne peut être testée avant déploiement autorisé | Non exécuté au lot 0 conformément au §12. Les valeurs déjà localisées constituent le périmètre, mais chaque contrôle documentaire devra d'abord retourner un résultat non vide ; les captures et faits externes resteront explicitement en attente. | `docs/release-readiness-rc4.md` ; `docs/dossier-projet/liste-captures-a-realiser.md` ; `docs/dossier-projet/corrections-dossier-final.md` ; runbook, dossier jury et documents citant des totaux/version/SHA | Recalculer tous les faits au SHA candidat, synchroniser readiness/runbook/dossier, préparer la liste exacte des captures post-déploiement et distinguer preuves locales, CI et externes. | Recherches de valeurs périmées ; validation liens/SHA/totaux ; revue terminale documentaire ; captures uniquement après GO déploiement sur RC4 réellement servie. | `PENDING_EXECUTION[R4-10:GREEN_EVIDENCE]` | Faits recopiés, total non disjoint, capture RC3 attribuée à RC4, preuve externe inventée, document mis à jour avant le SHA final. | `OPEN_RED_PENDING` |
| **R4-11** | **P0** | Plan RC4 §11, §14.3–14.6, §15 | Patrimoine RC3 présent à préserver : migrations 049/050, session Board sans expiration et révocable, correction v2 avec snapshots, arbitrages, suivi explicite, séparation motif/diagnostic, erreurs structurées, courriel multipart, redaction des secrets, SelectField et provenance OCI. Lacunes de preuve supplémentaires du diagnostic et les `16 GAP`/`11 EXCEPTION_TO_REVIEW` de l'inventaire sont détaillés en §7, notamment correction annoncée à tort appliquée, succès absents, modales fermées ou figées en erreur, faux succès reset et saisie Support perdue. | Aucun rouge générique valable pour un groupe d'invariants : baseline par `git diff --exit-code v1.0.0-rc.3 -- backend/migrations/` et recomptages §3 ; chaque défaut fonctionnel de §7 recevra sa commande rouge exacte avant correction | La baseline est verte (diff vide ; `1 146` tests recensés, suites locales exécutées vertes) et n'est pas présentée comme un rouge. Les lacunes de §7 restent ouvertes ; les regrouper sous une commande représentative violerait la règle d'interaction exacte. | `backend/migrations/049_*` et `050_*` ; tests Board auth/session ; tests correction/arbitrage PostgreSQL ; repository/service Atelier ; tests suivi et erreurs ; modèles courriel ; logs/redaction ; composant `SelectField` ; workflows/images OCI ; E2E attente/correction/annulation ; surfaces de l'inventaire | Ne modifier aucune migration ; compléter uniquement les preuves manquantes et corriger minimalement tout écart réellement reproduit, sans changer les permissions ou contrats métier. | Diff byte-identique migrations ; PostgreSQL réel et concurrence exactement un gagnant ; retraits de demandes par leur demandeur ; motifs obligatoires aux refus ; requête HTTP d'une ancienne session après révocation ; suivi explicite ; motif séparé sur Atelier/panneau/Board/historique ; erreurs sûres ; courriel HTML+texte avec lien correct ; logs sans cookie/JWT ; SelectField mesuré au viewport ; OCI et préflight registry-only ; cycles ciblés des lacunes d'inventaire ; SMTP externe après GO. | `PENDING_EXECUTION[R4-11:GREEN_EVIDENCE]` ; invariant migrations et socle de suites confirmés au lot 0 | Régression métier silencieuse, test unitaire confondu avec preuve HTTP/SQL/navigateur, concurrence non déterministe, SMTP réel faussement déclaré local, lacune de mutation oubliée, altération accidentelle d'une migration. | `OPEN_RED_PENDING` |

## 6. Registre exécutable des cycles rouge → vert

Toutes les preuves ci-dessous ont été exécutées sur le SHA
`e5019eef374d580eca8d4f62af61bbd3135ceecb`, avant toute correction produit.
Les sondes de test temporaires ont été ajoutées par patch, exécutées une à une,
puis entièrement retirées par patch. Elles ne figurent donc pas dans le commit
documentaire cassé. Après retrait, les quatre fichiers frontend concernés ont
repassé `50/50` tests et le fichier backend ciblé `15/15`. Ces contrôles prouvent
le retour à la base, pas le vert des corrections futures.

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
npm test -- src/components/__tests__/IncidentCard.test.tsx -t 'RC4 RED — ouvre le dossier quand la métadonnée produit est cliquée'
```

- code de sortie : `1` ;
- sortie utile : `1 failed`, `22 skipped` ;
- assertion : `onClick` attendu avec l'incident, nombre d'appels reçu `0` ;
- cause : le clic a visé la métadonnée produit, tandis que l'activation RC3 est
  attachée uniquement au bouton du titre ;
- portée R4-02 : une fois la sonde retirée, la suite historique est restée
  verte dans le contrôle ciblé `50/50`, ce qui confirme qu'elle prouve une
  interaction de substitution et non ce clic réel.

Vert : `PENDING_EXECUTION[R4-01:R4-02_GREEN_AFTER_LOT1]`.

### R4-03 — recentrage et décalage dynamique

Répertoire d'exécution : `frontend/`.

```bash
npm test -- src/pages/__tests__/WorkshopDashboardPage.test.tsx -t 'RC4 RED — ouvre une carte basse sans décalage dynamique ni recentrage de page'
```

- code de sortie : `1` ;
- sortie utile : `1 failed`, `5 skipped` ;
- assertion : `window.scrollBy` attendu sans appel, reçu une fois avec
  `{ behavior: "smooth", top: 432 }` ;
- cause : l'ouverture d'une carte basse déclenche encore le recentrage RC3.

```bash
npm test -- src/pages/__tests__/WorkshopDashboardPage.test.tsx -t 'RC4 RED — supprime tout offset inline calculé depuis la carte ouverte'
```

- code de sortie : `1` ;
- sortie utile : `1 failed`, `5 skipped` ;
- assertion future-compatible : valeur de
  `--incident-detail-offset-top` attendue vide, reçue `740px` ;
- cause : la page calcule et injecte encore l'offset inline. Le vert exigera
  l'absence de la propriété, pas une valeur artificielle `0px`.

Vert : `PENDING_EXECUTION[R4-03:GREEN_AFTER_LOT2]`, avec preuve navigateur
réelle encore obligatoire.

### R4-04 — motif courant sur le Board

Répertoire d'exécution : `frontend/`.

```bash
npm test -- src/components/__tests__/BoardIncidentGrid.test.tsx -t 'RC4 RED — affiche le motif courant pour un incident en attente'
```

- code de sortie : `1` ;
- sortie utile : `1 failed`, `9 skipped` ;
- assertion : texte attendu
  `Motif de mise en attente : Attente pièce détachée`, introuvable ;
- cause : le DOM rend bien `PENDING`/« En attente », mais ne reçoit ni
  n'affiche `waiting_reason`.

Vert : `PENDING_EXECUTION[R4-04:GREEN_AFTER_LOT3]`, avec projection PostgreSQL
minimale et parcours reprise/historique encore obligatoires.

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

Vert : `PENDING_EXECUTION[R4-05:GREEN_AFTER_LOTS4_5]`.

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

Vert : `PENDING_EXECUTION[R4-07:GREEN_AFTER_LOT6]`.

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
| R4-06 | Inventaire complet, interactions exactes classées ; rouges par lacune non encore exécutés | `PENDING_EXECUTION[R4-06:RED_GREEN_BY_MUTATION]` |
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
