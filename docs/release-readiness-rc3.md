# Préparation de la release Sentinel v1.0.0-rc.3

**Statut : NO-GO** (RC3 en cours de réalisation)

**Branche de stabilisation :** `release/v1.0.0-rc3`

**Baseline :** `a85c55c03608da2e52838b3a06ec1610a7683813` (`main`, `v1.0.0-rc.2`, 26 juillet 2026)

Ce document est la source canonique et publique de pilotage de la RC3. Il relie
chaque constat à une décision, un lot, une preuve de correction et un état. La
RC3 n'ajoute aucun domaine fonctionnel : elle rend prévisibles, explicites et
démontrables les fonctions déjà présentes (retour d'action, erreurs publiques,
traçabilité fidèle, arbitrages visibles, suivi explicite, mise en attente comme
concept métier, session Board sans expiration, cartes et panneau accessibles).

## 1. Règles de pilotage

- gel fonctionnel : aucun nouveau besoin produit n'entre dans cette branche ;
- un lot ne mélange pas correction métier, refonte esthétique et maintenance sans
  rapport direct ;
- chaque correction est livrée avec ses tests comportementaux et sa documentation
  dans le même lot ;
- les migrations existantes `001` à `048` restent **inchangées** (ni
  modification ni suppression) ; les seules migrations RC3 ajoutées sont `049`
  et `050` ;
- un constat passe à `VERIFIED` seulement après revue du diff, tests requis et CI
  verte sur le commit qui le corrige ;
- un résultat local ne remplace pas une preuve PostgreSQL, navigateur ou VPS quand
  le contrat dépend de cet environnement ;
- l'historique Git existant n'est pas réécrit ; aucun amend, rebase, squash,
  force-push ou trailer `Co-authored-by` ;
- aucun push, PR, merge, tag ni déploiement sans autorisation explicite ;
- hors périmètre RC3, reportés : exports CSV (**v1.1**), impression/PDF (**v1.2**),
  partage courriel tracé (**v1.3**).
- **validation PostgreSQL locale** : `backend/scripts/with-disposable-postgres.sh`
  provisionne un PostgreSQL jetable identique à la CI (`postgres:15.18-alpine3.23`,
  port loopback dynamique, volume anonyme, nettoyage par trap, zéro résidu prouvé),
  sans `sudo`, sans toucher au PostgreSQL système ni au `.env` du dépôt. Tout
  constat PostgreSQL n'est marqué `VERIFIED` qu'après un cycle rouge → vert
  réellement exécuté avec ce runner (ou en CI après push autorisé).

## 2. Contrats figés (avant toute modification de code)

### 2.1 Contrat UX commun — cinq états de mutation

1. **Prêt** : libellé d'action explicite.
2. **En cours** : bouton désactivé, libellé progressif, double clic bloqué.
3. **Succès** : message précis dans une zone `aria-live="polite"`, ~6 s, fermable.
4. **Échec** : message compréhensible et persistant dans `role="alert"`, sans
   perte des valeurs saisies ; une modale en échec reste ouverte.
5. **Récupération** : réessai/retour possible, focus replacé correctement.

Règles : confirmation exigée pour annulation définitive, invalidation, clôture et
révocations de session ; la modale d'arbitrage d'annulation **est** la
confirmation (bouton final « Confirmer l'annulation », pas de seconde modale) ;
erreurs de champ près du champ, erreurs réseau/globales via le système global ;
aucun bouton n'envoie deux mutations simultanées ; fermer une modale après succès
restaure le focus sur l'élément déclencheur ; messages formulés en résultat
métier, jamais en réponse HTTP.

Catalogue des messages de succès : voir plan §4 (figé, non répété ici pour éviter
la divergence — le catalogue est repris tel quel dans les tests du lot 1/10).

### 2.2 Contrat de traçabilité

Charge JSONB versionnée et autoportante des événements de correction :

```json
{
  "schemaVersion": 2,
  "requestEventId": 123,
  "changes": {
    "state": { "before": "DEGRADEE", "after": "INDISPONIBLE" },
    "currentProduct": { "before": "TBM", "after": "E365" }
  },
  "decisionReason": "Motif éventuel de la décision"
}
```

- Le snapshot **avant** est pris à la demande, **dans la transaction**, jamais
  recalculé plus tard depuis l'incident devenu mutable.
- Application et refus conservent le même diff. Un refus exige un motif court.
- Les événements historiques incomplets ne sont **jamais** complétés par une
  valeur inventée : l'interface affiche « Détail non enregistré pour cet
  événement antérieur. »
- Statut courant (bandeau du dossier : « Statut actuel : … ») ≠ statut
  événementiel. Une ligne d'événement n'affiche une transition que si le payload
  contient `from/to` ou `before/after`. Le Journal ne montre plus le statut
  courant sous chaque événement. L'API peut renommer les champs joints en
  `current_status` / `current_state`.

### 2.3 Contrat d'erreur public

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Une valeur est invalide.",
    "details": { "field": "boardSessionDuration", "reason": "OUT_OF_RANGE", "min": 1, "max": 168 }
  }
}
```

Le frontend traduit `code + details` vers un libellé métier et n'affiche plus
automatiquement le `message` brut ; un fallback générique couvre les erreurs
inconnues. Aucun identifiant `snake_case` ni nom de colonne SQL n'apparaît à
l'écran. `NETWORK_ERROR`, `REQUEST_TIMEOUT`, `NO_CHANGES`,
`ARBITRATION_ALREADY_PENDING`, `SESSION_REVOKED` et les validations ont chacun un
message et une issue adaptés. Le texte ne pilote jamais la logique applicative.

### 2.4 Terminologie figée

- Mise en attente : action « Mettre en attente » · statut « En attente » · champ
  « Motif de mise en attente » · événement « Mise en attente » · sortie
  « Reprendre le traitement ».
- Arbitrage : « Modification à arbitrer » / « Annulation à arbitrer » (carte,
  panneau, Board) ; bouton destructif final « Confirmer l'annulation ».
- Rôles en français : `OPERATOR`→Opérateur, `MAINTENANCE`→Technicien,
  `RESPONSABLE`→Responsable, `ADMIN`→Administrateur, `SYSTEM`→Système.
- « Narratif atelier » → « Suivi de l'incident ».
- Session Board sans expiration : « Session Board sans expiration automatique —
  Reste active tant que le navigateur conserve sa session. Elle peut être révoquée
  immédiatement depuis cette page. »

### 2.5 Stratégie de migrations

- **Migrations existantes `001` à `048` : inchangées** (ni modification ni
  suppression).
- **Migrations RC3 ajoutées : `049` et `050` uniquement.**
  - `049_allow_board_session_without_automatic_expiry.sql` (lot 3) : autorise le
    marqueur interne `0` (sans expiration), append-only.
  - `050_model_waiting_reason_separately_from_diagnostic.sql` (lot 7) : ajoute
    `waiting_reason`, backfill des seuls incidents actuellement `PENDING` depuis
    `diagnostic` puis efface leur `diagnostic`, append-only.
- **Preuve du diff des migrations** (`git diff --name-status origin/main...HEAD
  -- backend/migrations/`) : exactement deux entrées, toutes deux en statut `A`
  (ajout) —
  `A backend/migrations/049_allow_board_session_without_automatic_expiry.sql`,
  `A backend/migrations/050_model_waiting_reason_separately_from_diagnostic.sql`.
  Aucune entrée `M` (modifiée) ni `D` (supprimée). Contrôle complémentaire :
  `git diff --stat origin/main...HEAD -- 'backend/migrations/0[0-3][0-9]_*.sql'
  'backend/migrations/04[0-8]_*.sql'` renvoie un diff **vide** — `001` à `048`
  sont strictement identiques à `origin/main`.
- **Validation des migrations :**
  - `049 → 050` avec données ciblées `PENDING` : **déjà exécutée** sur
    PostgreSQL réel jetable (runMigrations 001→050 sur base vierge, puis backfill
    rejoué sur lignes de forme ancienne ; cf. C-05).
  - `048 → 050` (montée depuis une base réellement figée à `048`) : **à exécuter
    au lot 11** si elle n'a pas encore été faite exactement sous cette forme —
    non couverte par la validation base-vierge ci-dessus.

## 3. Matrice des constats

Sévérité : P0 (bloquant métier/traçabilité), P1 (contrat UX/API), P2 (secondaire).
État : `OPEN` → `IN_PROGRESS` → `VERIFIED` (diff relu + tests requis verts).

### C-01 — Traçabilité ambiguë : le Journal affiche le statut courant sous chaque événement

- **Sévérité :** P0
- **Preuve initiale :** `backend/src/modules/workshop/workshop.repository.ts:28,967`
  joint `wi.status` ; le Journal restitue ce statut courant sous des événements
  anciens (ex. « Incident signalé » affiché « Annulé »). Aucun `before/after`
  n'est exigé pour afficher une transition.
- **Fichiers concernés :** `workshop.repository.ts`, projection Journal/Historique
  frontend, traducteurs d'événements.
- **Correction (lot 4) :** payload d'événement versionné `schemaVersion:2` avec
  `before/after` snapshoté **dans la transaction** à la demande
  (`workshop.correctionEvents.ts`) ; application et refus rattachés à la même
  demande (`requestEventId`) et au même diff (via l'arbitrage) ; refus = motif
  obligatoire persisté dans l'événement, l'arbitrage (`decision_reason`) et la
  notification. Champs joints du Journal renommés `wi.status`→`current_status`,
  `wi.state`→`current_state` ; le statut courant n'est **plus** affiché sous
  chaque ligne d'événement ; la restitution n'affiche une transition que sur
  `before/after` et affiche « Détail non enregistré pour cet événement antérieur »
  pour un événement de correction sans payload versionné (rien inventé).
- **Tests :** unité `correctionEvents` (payload versionné) et `workshopHistory`
  (restitution avant→après, motif, fallback historique, « pas de transition sans
  before/after ») ; frontend `ReviewIncidentRequestModal` (motif conditionnel,
  blocage vide/espaces, trim, conservation après échec) ; **intégration
  PostgreSQL réelle** `correctionArbitration` : événement `schemaVersion:2` avec
  before snapshoté, refus sans/avec-espaces refusé, refus valide conserve le diff
  + motif + arbitrage + **outbox**, application conserve le même avant→après.
  Backend unit 490, intégration 121/121 (PG jetable), frontend 433.
- **Preuve finale :** commit _(lot 4, ci-dessous)_. Cycle rouge→vert exécuté sur
  PostgreSQL via `with-disposable-postgres.sh`.
- **État :** VERIFIED (statut courant/événementiel séparé ; restitution finalisée
  au lot 9 pour la terminologie « Suivi de l'incident » et l'élargissement UI)

### C-02 — Retour d'action incomplet (mutations silencieuses, contrats hétérogènes)

- **Sévérité :** P1
- **Preuve initiale :** plusieurs mutations ferment une modale/rafraîchissent une
  carte sans annoncer le résultat ; erreurs de formulaire, réseau et métier ne
  suivent pas un contrat unique.
- **Fichiers concernés :** composants de mutation Atelier/Administration,
  infrastructure de feedback frontend.
- **Correction (lot 1) :** mécanisme global unique succès/erreur (cinq états),
  anti-double soumission, restauration du focus, monté dans `App`. Branché sur le
  hub `useIncidentActions` (toutes les mutations d'incident Atelier, là où le
  retour était réellement absent : prise en charge, mise en attente, reprise,
  clôture, invalidation, urgence, suivi, demande d'annulation, arbitrages). Les
  surfaces Administration/Board possèdent déjà un retour local accessible
  (`SuccessBanner`/`ErrorBanner`) et sont alignées dans leur lot dédié (2 et 3)
  pour éviter un double affichage et un double travail.
- **Tests :** `MutationFeedback.test.tsx` (succès poli auto-6s, erreur
  persistante `role="alert"`, verrou double-soumission) ;
  `useIncidentActions.feedback.test.tsx` (succès métier annoncé, échec en
  `role="alert"` sans fermer la modale, double-clic = un seul appel API). Suite
  frontend complète 417/417.
- **Preuve finale :** commits `fd1ff70` (fondation) + `3b4e736` (hub Atelier) +
  branchement création/consigne. Couverture par mutation ci-dessous.
- **État :** VERIFIED (mutations d'incident + création + consigne branchées ;
  réglages/révocations traités au lot 2/3 avec leur bannière locale accessible)

**Couverture par mutation (contrat 5 états + verrou anti-double + tests) :**

| Mutation | Où | Succès (message) | Échec | Verrou | Tests |
| --- | --- | --- | --- | --- | --- |
| Création | `CreateIncidentModal.handleSubmit` | global « Incident signalé. » | erreur traduite locale au formulaire, saisies conservées | `loading` + garde | `CreateIncidentModal.test` (9) |
| Prise en charge | `useIncidentActions.handleConfirmTakeCharge` | global « Prise en charge enregistrée. » | `role="alert"` global, modale ouverte | `simpleActionRef` | `useIncidentActions.feedback.test` |
| Mise en attente | `handleSetPending` | « Incident mis en attente. » | idem | idem | idem |
| Reprise | `handleResumeIncident` | « Traitement repris. » | idem | idem | idem |
| Clôture | `handleCloseIncident` | « Incident clôturé… » | idem | idem | idem |
| Invalidation | `handleInvalidateIncident` | « Incident invalidé… » | idem | idem | idem |
| Urgence | `handleToggleUrgent` | « Incident déclaré urgent / urgence retirée. » | idem | idem | idem |
| Suivi | `handleToggleFollow` | « Suivi activé / désactivé. » | idem | idem | idem |
| Consigne | `IncidentDetailPanel.runPanelAction('responsible-comment')` | « Consigne enregistrée. » | erreur traduite locale (`actionError`) | `pendingActionRef` | suite panel |
| Correction demandée | flux `CreateIncidentModal`/edit + `handleRequestDelete` | catalogue | idem | idem | idem |
| Correction appliquée/refusée | `handleApplyEditRequest` / `handleRejectEditRequest` | « Modification appliquée / refusée. » | erreur locale à la modale d'arbitrage | `reviewActionRef` | `useIncidentActions.feedback.test` |
| Annulation demandée/retirée | `handleRequestDelete` (+ `withdrawCancelRequest` lot 5) | catalogue | idem | idem | idem |
| Annulation appliquée/refusée | `handleApproveDeleteRequest` / `handleRejectDeleteRequest` / `handleMaintenanceDeleteConfirm` | « Incident annulé… / Demande d'annulation refusée. » | erreur locale à la modale | `reviewActionRef` | idem |
| Réglages (Admin) | `AdminSettingsPage.handleAppSettingsSubmit` | local « Paramètres enregistrés. » (bannière `SuccessBanner`) | erreur **traduite** (lot 2) + focus champ | `appSettingsSaving` | `adminSettings.controller.errors.test` + à couvrir E2E lot 10 |
| Révocations | `AdminSettingsPage` (mêmes handlers) | « Sessions … révoquées. » | idem | idem | idem |

Les surfaces Administration conservent leur bannière **locale** accessible
(`SuccessBanner`/`ErrorBanner`) comme autorité de retour, désormais alimentée par
le message **traduit** du lot 2 ; les réglages Board (session sans expiration) et
les révocations sont finalisés au lot 3.

### C-03 — Erreurs techniques exposées (`error.message` brut)

- **Sévérité :** P1
- **Preuve initiale :** `frontend/src/api/client.ts:67`
  (`message = data.error.message`) et usages directs `err.message`
  (`EditMachineModal.tsx:84,113`, etc.) ; l'API renvoie des textes comme
  `board_session_ttl_hours doit être un entier entre 1 et 168`
  (`backend/src/modules/adminSettings/adminSettings.controller.ts:230`).
- **Fichiers concernés :** `client.ts`, `ApiResponseError`, contrôleurs de
  validation, composants affichant `err.message`.
- **Correction (lot 2) :** `errors.ts` gagne `PublicField`/`ErrorReason`/
  `ErrorDetails` + `PUBLIC_ERROR_MESSAGE` ; `sendError(details?)` rétrocompatible.
  Le controller mappe chaque réglage interne vers son champ **public**
  (`board_session_ttl_hours` → `boardSessionDuration`) et émet le message
  générique + `details`, plus aucun nom interne. Frontend : `ApiResponseError.details`
  et un traducteur `errorMessages.ts` (`translateApiError`) qui n'affiche jamais
  `message`/`field`/`reason`/snake_case et retombe sur un générique sûr ;
  `AdminSettingsPage` affiche le message traduit, conserve les saisies et ramène
  le focus au champ concerné.
- **Tests :** `errors.test.ts` (payload rétrocompatible + details) ;
  `adminSettings.controller.errors.test.ts` (mapping + **négatif** : aucun
  identifiant interne dans la réponse) ; `errorMessages.test.ts` (traduction de
  chaque reason/code, inconnu→générique, **négatif** : le message brut ne
  surface jamais). Backend unit 481, frontend 425, coverage branches ≥ 80 %.
- **Preuve finale :** commit `8932ae9`.
- **État :** VERIFIED

### C-04 — Option Board contradictoire (« illimitée » = `0`, contrainte `1..168`)

- **Sévérité :** P0
- **Preuve initiale :** contrainte `board_session_ttl_hours { min: 1, max: 168 }`
  (`adminSettings.controller.ts:230`) alors que l'UI propose « illimitée » ;
  `jwt.ts:14,24` et `board.auth.ts:55,58` savent déjà gérer `'unlimited'`.
- **Fichiers concernés :** migration `049`, `adminSettings.controller.ts`,
  `jwt.ts`, `board.auth.ts`, écran Administration.
- **Correction (lot 3) :** migration append-only `049` assouplit la contrainte
  `chk_board_session_duration` en `= 0 OR BETWEEN 1 AND 168` (041 inchangée) ;
  `board.auth.ts` traduit `0 → 'unlimited'` pour le JWT (aucun `exp`) et le cookie
  (cookie de session, aucun `maxAge`) ; la validation controller accepte `0` via
  `allowZero` ; révocation conservée par `board_session_version` ; libellé exact
  figé (§2.4) posé dans `AdminSettingsPage`.
- **Tests :** `jwt.boardSession.test.ts` (`'unlimited'` → JWT sans `exp`, durée →
  `exp` = h×3600) ; `adminSettings.boardSession.test.ts` (0 accepté et transmis à
  la persistance, hors-plage rejeté) ; **intégration** `boardSessionMigration…`
  (migration 001→049 sur base réelle : 0 accepté, 1/168 acceptés, −1/169/200
  rejetés par la contrainte). Cas du lot 2 réalignés (0 n'est plus « hors
  bornes »). Backend unit 485, frontend 425.
- **Preuve finale :** commits `1249c3a` (implémentation) + validation PG. Cycle
  « rouge → vert » **réellement exécuté** sur un PostgreSQL jetable isolé
  (`postgres:15.18-alpine3.23`, identique CI, via
  `backend/scripts/with-disposable-postgres.sh` : port loopback dynamique, volume
  anonyme, trap, zéro résidu prouvé ; le `.env` du dépôt n'est pas touché) :
  - **ROUGE** : sous la contrainte RC2 (1..168), `0` est refusé ;
  - **migration `049`** appliquée puis `runMigrations` 001→049 sur base vierge ;
  - **VERT** : `0` accepté, `1`/`168` acceptés, `-1`/`169`/`200` refusés ;
  - **modes** : durée normale (12) persistée, sans-expiration (0) persistée,
    **révocation** = `board_session_version` incrémenté, retour à une durée (24) ;
  - unitaires : `jwt.boardSession` (`'unlimited'` → JWT sans `exp` ; durée → `exp`).
  Suites d'intégration `boardSessionMigration` + `boardSessionSettings` : **8/8**.
- **État :** VERIFIED

### C-05 — Mise en attente stockée comme « diagnostic »

- **Sévérité :** P0
- **Preuve initiale :**
  `backend/src/modules/workshop/workshop.service.mutations.ts:109,128`
  (`updates: { status: 'PENDING', diagnostic }`) ;
  `notificationOutbox.worker.ts:182` lit `diagnostic` pour `INCIDENT_SET_PENDING`.
- **Fichiers concernés :** migration `050`, `workshop.service.mutations.ts`,
  `workshop.validation.ts`, worker de notification, carte/panneau/Board/Journal.
- **Correction (lot 7) :** `waiting_reason` réel ; API/UI `waitingReason` / « Motif
  de mise en attente » ; backfill des seuls incidents `PENDING` ; compatibilité de
  lecture des anciennes traces ; à la reprise, motif courant masqué mais conservé
  dans l'événement.
- **Tests :** migration base vierge + montée depuis base figée ; nouvelle mise
  en attente écrit `waiting_reason` ; reprise ; alignement des surfaces.
- **Décision métier (utilisateur, lot 7) :** `diagnostic` et « motif de mise en
  attente » sont deux concepts distincts. La migration 050 ne recopie que la
  valeur des incidents **actuellement** `PENDING` vers `waiting_reason` puis
  efface leur `diagnostic` (cette valeur n'a jamais été un diagnostic). Les
  sections « Diagnostic » sont **masquées** en l'absence de diagnostic réel,
  jamais affichées vides ; RC3 n'ajoute aucune nouvelle saisie de diagnostic.
  Les anciennes traces de mise en attente restent lisibles comme « motif de
  mise en attente historique », jamais comme diagnostic. Toute nouvelle mise en
  attente écrit uniquement `waiting_reason` ; la reprise efface la valeur
  courante mais l'événement conserve le motif.
- **Preuve finale (exécutée) :**
  - _Migration 050 sur PostgreSQL réel — validation `049 → 050` avec données
    ciblées `PENDING` (DÉJÀ EXÉCUTÉE)_ —
    `src/integration/__tests__/waitingReasonMigration.integration.test.ts` :
    la colonne `waiting_reason` (type `text`) existe après migration d'une base
    vierge (`runMigrations` 001→050) ; le backfill recopie le motif des
    **seuls** incidents `PENDING` puis efface leur `diagnostic` (un incident
    `OPEN` porteur d'un vrai diagnostic n'est pas touché) ; une nouvelle mise en
    attente écrit `waiting_reason` et jamais `diagnostic`.
  - _Validation finale `048 → 050` (montée depuis une base réellement figée à
    `048`) : À EXÉCUTER AU LOT 11_ si elle n'a pas encore été faite exactement
    sous cette forme — la preuve ci-dessus part d'une base vierge, pas d'une
    base préexistante arrêtée à `048`.
  - _Cycle service (unitaire)_ — `workshop.service.test.ts` :
    PENDING sans motif refusé (`VALIDATION_ERROR`) ; PENDING avec motif écrit
    `updates.waitingReason` et loggue l'événement `INCIDENT_SET_PENDING` avec
    `waitingReason` ; à la reprise, `updates.waitingReason = null` (motif
    effacé) mais l'événement `INCIDENT_RESUMED` conserve le motif.
  - _Restitution frontend_ — `IncidentCard.test.tsx` (« Motif de mise en
    attente : … », plus jamais « Suspension justifiée ») ;
    `workshopHistory.test.ts` (nouvelle trace `waitingReason` et ancienne trace
    `diagnostic` toutes deux rendues « motif de mise en attente », jamais
    « diagnostic »). Panneau : le motif de mise en attente n'apparaît que tant
    que l'incident est `PENDING` ; les sections « Diagnostic » restent masquées
    quand `diagnostic` est vide. Modale de suspension : libellé « Motif de mise
    en attente ». Notification followers : « Motif de mise en attente : … »,
    avec repli de lecture sur l'ancienne clé `diagnostic`.
- **Résultats globaux (exécutés) :** backend unit 493/493 ; intégration
  PostgreSQL réelle 135/135 (19 suites) ; frontend 448/448 (52 fichiers) ;
  ESLint + Prettier + typecheck propres.
- **État :** VERIFIED

### C-06 — Arbitrages visibles de façon inégale ; retrait d'annulation absent

- **Sévérité :** P0
- **Preuve initiale :** l'arbitrage existe côté service
  (`workshop.service.edit.ts:257,376`, `arbitration_required`) mais la visibilité
  carte/Board et le retrait de demande d'annulation ne sont pas symétriques ;
  aucune fonction `withdrawCancelRequest` recensée.
- **Fichiers concernés :** service/repository d'arbitrage, projection Board,
  cartes, panneau.
- **Correction (lot 5) :** `withdrawCancelRequest` (demandeur du cas `WAITING`
  uniquement), événement `CANCEL_REQUEST_WITHDRAWN`, indicateurs visibles à tous
  les rôles et sur le Board (commandes filtrées par rôle), motif de refus
  obligatoire et persistant.
- **Tests :** PostgreSQL concurrents (un seul gagnant, retrait interdit à un autre
  opérateur) ; visibilité multi-rôle ; Board minimal sans données privées.
- **Preuve finale (exécutée) :**
  - _Concurrence PostgreSQL réelle_ —
    `src/integration/__tests__/cancellationArbitration.integration.test.ts`
    (8 cas, verts sur PostgreSQL jetable) :
    - retrait par le demandeur (`retire la demande d'annulation …`) ;
    - retrait interdit à un autre opérateur → 403 (`interdit le retrait à un
      autre opérateur`) ;
    - refus sans motif / motif d'espaces refusés (motif obligatoire) ;
    - **retrait vs confirmation d'annulation** : exactement un gagnant, jamais
      d'état contradictoire (boucle 6×) ;
    - **deux retraits simultanés** : un seul succès, un seul événement
      `CANCEL_REQUEST_WITHDRAWN`, zéro doublon d'outbox, perdant en code métier
      stable (`CONFLICT`, jamais 500) ;
    - **décision finale d'annulation** : motif initial `Doublon de signalement.`
      préservé, arbitrage `APPROVED` + `decided_by`/`decided_at`, incident
      `CANCELED`, événements cohérents, incident encore présent en Historique.
  - _Projection Board minimale sur PostgreSQL réel_ —
    `src/integration/__tests__/boardArbitrationProjection.integration.test.ts` :
    `getBoardData` dérive `has_edit_arbitration` / `has_cancel_arbitration`
    (booléens) et n'expose ni motif (`cancel_request_reason`), ni contenu de
    demande (`edit_request`), ni identité (`user_id`, `decided_by`).
  - _Contrat SQL de la projection_ —
    `src/modules/workshop/__tests__/workshop.repository.test.ts`
    (« expose uniquement l'EXISTENCE d'un arbitrage au board »).
  - _Indicateur carte, parité inter-rôles_ —
    `frontend/src/components/__tests__/IncidentCard.test.tsx` : bouton cliquable
    pour le responsable (commande) vs `<span>` `--readonly` pour les autres
    rôles, même libellé court « Annulation à arbitrer » / « Modification à
    arbitrer ».
  - _Indicateur Board, lecture seule sans commande_ —
    `frontend/src/components/__tests__/BoardIncidentGrid.test.tsx` : chip
    `aria-label` « … à arbitrer », **aucun** `button` sur le Board.
  - _Panneau : retrait + parité + aucune commande aux rôles non autorisés_ —
    `frontend/src/components/__tests__/IncidentDetailPanel.test.tsx` (bloc
    « retrait de la demande d'annulation (lot 5) ») : bouton « Retirer ma
    demande » visible au seul demandeur d'une demande active, disparu sinon ;
    envoi de `{ withdrawCancelRequest: true }` + retour de succès accessible ;
    verrou anti-double-clic (bouton `disabled`, `patchIncident` appelé une
    fois) ; erreur métier traduite (`CONFLICT`) sans fuite du message brut et
    bouton de nouveau actionnable après échec ; rôle non autorisé
    (MAINTENANCE) voit « Demande en cours » mais aucun bouton « Arbitrer » /
    « Reprendre ».
- **Résultats globaux (exécutés) :** backend unit 491/491 ; intégration
  PostgreSQL réelle 130/130 (17 suites) ; frontend 446/446 (52 fichiers),
  couverture ≥ 80 % (statements 89,29 % / branches 82,02 % / fonctions 91,18 %
  / lignes 91,63 %) ; ESLint + Prettier propres.
- **État :** VERIFIED

### C-07 — Suivi implicite (`autoFollowForResponsable`)

- **Sévérité :** P0
- **Preuve initiale :** `workshop.service.mutations.ts:30` (définition) et appels
  multiples (`workshop.service.edit.ts:217,345,547,599` ;
  `workshop.service.mutations.ts:355,408,518,584`). Une étoile peut s'activer sans
  action explicite.
- **Fichiers concernés :** `workshop.service.mutations.ts`,
  `workshop.service.edit.ts`.
- **Correction (lot 6) :** supprimer `autoFollowForResponsable` et ses appels ;
  étoile = unique opt-in ; ne pas toucher les suivis existants ; vérifier les
  destinataires de notification.
- **Tests :** action responsable n'active pas l'étoile ; clic explicite
  active/retire ; destinataires conformes.
- **Preuve finale (exécutée) :**
  - `autoFollowForResponsable` et ses 9 appels supprimés (4 dans
    `workshop.service.mutations.ts` : setPriority, setResponsibleComment,
    rejectCancel, cancel ; 5 dans `workshop.service.edit.ts` : createIncident,
    editIncident, approveEdit, rejectEdit) ; `grep` confirme zéro référence
    restante. Aucune autre logique (table `workshop_incident_followers`,
    follow/unfollow explicites) modifiée.
  - _Cycle rouge → vert (unitaire)_ —
    `workshop.service.test.ts` (« n'ajoute JAMAIS de suivi implicite au
    responsable lorsqu'il agit (C-07) ») : rouge d'abord (approbation de
    correction appelait `followIncidentData(1,1,null)`), vert après suppression ;
    couvre approbation de correction et priorité.
  - _Preuve PostgreSQL réelle_ —
    `src/integration/__tests__/explicitFollow.integration.test.ts` :
    prioriser un incident n'ajoute pas le responsable aux suiveurs
    (`activeFollowerCount = 0`) ; un suivi explicite préexistant est préservé,
    ni retiré ni dupliqué, quand le responsable agit ensuite (`= 1`).
  - _Destinataires de notification_ — `getFollowersEmails`
    (`notifications.service.ts:47`) lit directement
    `workshop_incident_followers` (suivis explicites uniquement) ; les canaux
    « followers » (TAKEN/PENDING/CLOSED/CANCELED) sont donc désormais alimentés
    par le seul opt-in, sans logique de destinataire à modifier. Aucun suivi
    implicite côté frontend (seul `handleToggleFollow`, l'étoile, déclenche un
    suivi).
- **Résultats globaux (exécutés) :** backend unit 492/492 ; intégration
  PostgreSQL réelle 132/132 (18 suites) ; ESLint + Prettier + typecheck propres.
- **État :** VERIFIED

### C-08 — En-têtes de sécurité publics en double

- **Sévérité :** P2
- **Preuve initiale :** posés à deux niveaux —
  `backend/src/middlewares/securityHeaders.ts:12,13,17,21` **et**
  `frontend/nginx.conf:8,9,12,13` (X-Content-Type-Options, X-Frame-Options, CSP,
  HSTS).
- **Fichiers concernés :** `securityHeaders.ts`, `frontend/nginx.conf`.
- **Correction (lot 9/annexe) :** identifier l'autorité de chaque en-tête,
  conserver une seule valeur effective, vérifier le résultat public. Ne retarde
  aucun P0/P1.
- **Tests :** vérification qu'un seul exemplaire effectif est servi.
- **Preuve finale :** _(à compléter — P2)_
- **État :** OPEN

### C-09 — Notification e-mail dépendante des images distantes

- **Sévérité :** P2
- **Preuve initiale :** certains clients bloquent les images distantes ; le sujet,
  les données essentielles et le lien doivent rester compréhensibles sans image.
- **Fichiers concernés :** gabarits de notification.
- **Correction (P2) :** garantir la lisibilité sans chargement d'image.
- **Tests :** contenu essentiel présent hors image.
- **Preuve finale :** _(à compléter — P2)_
- **État :** OPEN

## 4. Portes de validation

- **Porte A — Contrats :** matrice complète, terminologie figée, payload
  événementiel figé, stratégie migrations approuvée. → **fermée par ce document
  (lot 0).**
- **Porte B — Intégrité métier :** VALIDÉE. Correction et annulation complètes,
  aucun suivi implicite, mise en attente comme concept métier, événements
  fidèles, tests PostgreSQL concurrents verts. **Aucun défaut ouvert sur le
  périmètre de la Porte B** (C-01, C-05, C-06, C-07 = VERIFIED). Les constats
  C-08/C-09 (P2) et les constats des lots 8-11 (dont C-08/C-09 pour la partie UX
  et sécurité) restent `OPEN`/`PENDING` et hors périmètre de cette porte.
- **Porte C — UX :** cinq états sur toutes les mutations, aucun message technique
  visible, cartes et panneau conformes, zéro violation axe critique.
- **Porte D — Release :** migrations testées (base vierge `001→050` **déjà
  faite** ; montée `048→050` sur base figée à `048` **à exécuter au lot 11**),
  six jobs CI verts sur le SHA candidat, aucun avertissement significatif,
  recette multi-rôle, captures depuis la RC3 déployée, dossier synchronisé sur
  le commit final.

## 5. Journal des lots

| Lot | Objet | Commit | État |
| --- | --- | --- | --- |
| 0 | Matrice et contrats RC3 | `docs: establish rc3 ux and traceability contracts` (5de13f8) | FAIT |
| 1 | Retour d'action standardisé | `fd1ff70` + `3b4e736` + `01aced1` (création/consigne + matrice) | FAIT |
| 2 | Erreurs publiques stables | `8932ae9` | FAIT |
| 3 | Session Board sans expiration | migration `049` + `fix(board)` (1249c3a) + validation PG | FAIT (VERIFIED sur PostgreSQL jetable) |
| 4 | Trace des corrections | `fix(audit)` + validation PG réelle | FAIT (VERIFIED sur PostgreSQL jetable) |
| 5 | Cycle d'annulation complet | `fix(workshop): complete cancellation arbitration lifecycle` (8c34136) | FAIT (C-06 VERIFIED sur PostgreSQL jetable) |
| 6 | Suivi explicite | `fix(workshop): require explicit incident follow consent` (1bd197f) | FAIT (C-07 VERIFIED : unitaire rouge→vert + PostgreSQL réel) |
| 7 | Mise en attente métier | `fix(workshop): model waiting reasons separately from diagnostics` (1e0f8ff) | FAIT (C-05 VERIFIED : migration 050 + PostgreSQL réel) |
| 8 | Cartes et panneau (clavier, focus, scroll) | `fix(ux): make the incident dossier keyboard- and scroll-safe` (4eb74cd) | FAIT (scroll drawer bureau borné + focus dossier à l'ouverture ; tests ciblés verts) |
| 9 | Terminologie et restitution | `fix(copy): align workshop labels with the incident lifecycle` | À FAIRE |
| 10 | Recette comportementale et axe | `test: cover rc3 multi-role ux and audit contracts` | À FAIRE |
| 11 | Documentation et candidate | `docs: synchronize the jury evidence with rc3` | À FAIRE |
