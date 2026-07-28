# Schémas Mermaid — Dossier de projet DWWM

> Schémas vérifiés le 28 juillet 2026 à partir des migrations `001` à `050`, des
> routes Express, de `workshop.policy.ts`, des services transactionnels et des
> gardes React du dépôt. Le MCD contient les **quatorze tables applicatives**. La table
> technique `schema_migrations`, créée par le moteur de migration, est volontairement
> exclue du domaine métier.
>
> Le code peut être collé dans [Mermaid Live](https://mermaid.live/) pour un export
> SVG ou PNG. Pour le dossier, privilégier le SVG afin de garder les libellés lisibles.

---

## 1. Modèle conceptuel de données — quatorze tables applicatives (référencé §6.2)

Les cardinalités traduisent la nullabilité réelle des clés étrangères. Par exemple,
`taken_by_user_id`, les cibles des journaux d'administration et `admin_id` sont
facultatifs en base ; le déclarant, la ligne, l'acteur d'un événement et les clés des
tables de suivi ou d'arbitrage sont obligatoires.

```mermaid
erDiagram
    ADMIN_ACCOUNTS o|--o{ ACCOUNT_AUDIT_EVENTS : "effectue"
    ADMIN_ACCOUNTS o|--o{ LINE_AUDIT_EVENTS : "effectue"
    ADMIN_ACCOUNTS o|--o{ ADMIN_SYSTEM_AUDIT_EVENTS : "effectue"

    SENTINEL_USERS o|--o{ ACCOUNT_AUDIT_EVENTS : "est cible de"
    SENTINEL_USERS ||--o{ PASSWORD_RESET_REQUESTS : "demande"
    SENTINEL_USERS ||--o{ WORKSHOP_INCIDENTS : "declare"
    SENTINEL_USERS o|--o{ WORKSHOP_INCIDENTS : "prend en charge"
    SENTINEL_USERS ||--o{ WORKSHOP_INCIDENT_EVENTS : "agit"
    SENTINEL_USERS ||--o{ WORKSHOP_INCIDENT_FOLLOWERS : "suit"
    SENTINEL_USERS ||--o{ WORKSHOP_ARBITRATION_CONSULTATIONS : "consulte"
    SENTINEL_USERS ||--o{ WORKSHOP_ARBITRATION_CASES : "demande ou decide"

    PRODUCTION_LINES o|--o{ LINE_AUDIT_EVENTS : "est cible de"
    PRODUCTION_LINES ||--o{ WORKSHOP_INCIDENTS : "concerne"
    PRODUCTION_LINES ||--o{ PRODUCTION_LINE_MACHINES : "normalise"

    WORKSHOP_INCIDENTS ||--o{ WORKSHOP_INCIDENT_EVENTS : "produit"
    WORKSHOP_INCIDENTS ||--o{ WORKSHOP_INCIDENT_FOLLOWERS : "est suivi par"
    WORKSHOP_INCIDENTS ||--o{ WORKSHOP_ARBITRATION_CONSULTATIONS : "porte"
    WORKSHOP_INCIDENTS ||--o{ WORKSHOP_ARBITRATION_CASES : "porte"
    WORKSHOP_INCIDENT_EVENTS ||--o| WORKSHOP_ARBITRATION_CONSULTATIONS : "demande consultee"
    WORKSHOP_INCIDENT_EVENTS ||--o| WORKSHOP_ARBITRATION_CASES : "ouvre"
    WORKSHOP_INCIDENT_EVENTS ||--o| NOTIFICATION_OUTBOX : "notifie"
    PASSWORD_RESET_REQUESTS ||--o| NOTIFICATION_OUTBOX : "notifie"

    ADMIN_ACCOUNTS {
        int id PK
        varchar username UK
        varchar password_hash
        varchar email "nullable"
        int session_version
        boolean notif_admin
        boolean notif_responsables
        boolean notif_techniciens
        boolean notif_operateurs
        boolean board_enabled
        varchar board_code_hash "nullable"
        int board_session_version
        int session_duration_hours
        int workshop_session_hours
        int board_session_ttl_hours
        int login_max_attempts
        int setup_code_ttl_hours
        varchar board_label
        timestamptz created_at
        timestamptz updated_at
    }

    SENTINEL_USERS {
        int id PK
        varchar first_name
        varchar last_name
        varchar badge_number UK "unique parmi les comptes non supprimes"
        varchar role
        varchar email "nullable"
        boolean is_active
        boolean is_deleted
        varchar password_hash "nullable"
        varchar password_setup_token_hash "nullable"
        timestamptz password_setup_expires_at "nullable"
        int session_version
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "nullable"
    }

    PRODUCTION_LINES {
        int id PK
        varchar line_number UK "unique parmi les lignes non archivees"
        jsonb machine_sequence
        boolean is_active
        boolean is_deleted
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at "nullable"
    }

    PRODUCTION_LINE_MACHINES {
        int line_id PK, FK
        int position PK
        varchar machine_id
        varchar normalized_machine_id UK
        jsonb payload
        timestamptz created_at
        timestamptz updated_at
    }

    WORKSHOP_INCIDENTS {
        int id PK
        int user_id FK
        int line_id FK
        int taken_by_user_id FK "nullable"
        varchar line_number
        varchar machine_id
        varchar machine_brand
        varchar robot_label
        int head_number
        varchar state
        varchar status
        text comment "nullable"
        varchar current_product "nullable"
        boolean is_taken
        boolean is_priority
        text waiting_reason "nullable"
        text diagnostic "nullable"
        text intervention_note "nullable"
        text responsible_comment "nullable"
        jsonb edit_request "nullable"
        boolean cancel_request
        text cancel_request_reason "nullable"
        boolean delete_request "alias historique"
        text delete_request_reason "alias historique nullable"
        timestamptz taken_at "nullable"
        bigint display_order
        varchar declarant_first_name "snapshot nullable"
        varchar declarant_last_name "snapshot nullable"
        varchar declarant_role "snapshot nullable"
        varchar declarant_badge_number "snapshot nullable"
        varchar taken_by_first_name "snapshot nullable"
        varchar taken_by_last_name "snapshot nullable"
        varchar taken_by_role "snapshot nullable"
        timestamptz created_at
        timestamptz updated_at
    }

    WORKSHOP_INCIDENT_EVENTS {
        int id PK
        int incident_id FK
        int actor_user_id FK
        varchar event_type
        jsonb payload "nullable"
        varchar actor_first_name "snapshot nullable"
        varchar actor_last_name "snapshot nullable"
        varchar actor_role "snapshot nullable"
        varchar actor_badge_number "snapshot nullable"
        timestamptz created_at
    }

    WORKSHOP_INCIDENT_FOLLOWERS {
        int id PK
        int incident_id FK
        int user_id FK
        timestamptz created_at
        timestamptz deleted_at "nullable soft-delete"
    }

    WORKSHOP_ARBITRATION_CONSULTATIONS {
        int request_event_id PK, FK
        int incident_id FK
        text request_type
        int consulted_by_user_id FK
        timestamptz consulted_at
    }

    WORKSHOP_ARBITRATION_CASES {
        bigint id PK
        int incident_id FK
        int request_event_id FK, UK
        varchar request_type
        varchar status
        jsonb payload "nullable"
        text reason "nullable"
        int requested_by_user_id FK
        int consulted_by_user_id FK "nullable"
        int decided_by_user_id FK "nullable"
        text decision_reason "nullable"
    }

    ACCOUNT_AUDIT_EVENTS {
        int id PK
        int target_user_id FK "nullable"
        int admin_id FK "nullable"
        varchar event_type
        jsonb changes "nullable"
        varchar target_first_name "snapshot nullable"
        varchar target_last_name "snapshot nullable"
        varchar target_badge_number "snapshot nullable"
        timestamptz created_at
    }

    LINE_AUDIT_EVENTS {
        int id PK
        int target_line_id FK "nullable"
        int admin_id FK "nullable"
        varchar event_type
        jsonb changes "nullable"
        varchar target_line_number "snapshot nullable"
        timestamptz created_at
    }

    ADMIN_SYSTEM_AUDIT_EVENTS {
        int id PK
        int admin_id FK "nullable"
        varchar event_type
        jsonb changes "nullable"
        timestamptz created_at
    }

    PASSWORD_RESET_REQUESTS {
        int id PK
        int user_id FK
        varchar badge_number
        timestamptz requested_at
        timestamptz handled_at "nullable"
    }

    NOTIFICATION_OUTBOX {
        bigint id PK
        int source_event_id FK "nullable"
        int password_reset_request_id FK "nullable"
        varchar status
        int attempt_count
        timestamptz available_at
        timestamptz locked_at "nullable"
        timestamptz completed_at "nullable"
        varchar last_error_code "nullable"
    }
```

### Contraintes physiques structurantes à faire apparaître dans le MPD (§6.4)

- `sentinel_users.role` est limité à `OPERATOR`, `MAINTENANCE` ou `RESPONSABLE` ;
- `workshop_incidents.status` est limité à `OPEN`, `PENDING`, `CLOSED`,
  `CANCELED` ou `INVALIDATED` ;
- `workshop_incidents.state` est limité à `SKIPEE_PAR_MACHINE`,
  `SKIPEE_PAR_CONDUCTEUR`, `DEGRADEE` ou `INDISPONIBLE` ;
- `chk_taken_consistency` synchronise `is_taken`, `taken_by_user_id` et `taken_at` ;
- `chk_pending_must_be_taken` interdit un incident `PENDING` non pris ;
- `chk_edit_request_shape` impose un objet JSON contenant au moins un champ métier connu ;
- l'index unique partiel `idx_unique_active_incident_per_machine` interdit deux
  incidents actifs sur le même emplacement `(line_id, machine_id, robot_label, head_number)` ;
- `workshop_arbitration_consultations.request_event_id` est à la fois sa clé primaire
  et une clé étrangère vers `workshop_incident_events.id` ;
- la suppression d'un incident cascade vers ses événements et consultations
  d'arbitrage ; les relations de suivi vers l'incident et l'utilisateur sont en
  `ON DELETE RESTRICT` ; les autres clés étrangères conservent le comportement
  PostgreSQL par défaut (`NO ACTION`) ;
- les suppressions des comptes et lignes sont logiques. Les snapshots d'identité
  préservent la lisibilité de l'historique après anonymisation ou archivage ;
- `schema_migrations(filename, checksum, applied_at)` est une table technique du
  moteur de migration : elle doit être montrée à part dans le MPD, jamais
  comptée parmi les quatorze tables applicatives.

---

## 2. Diagramme de cas d'utilisation — capacités réelles (référencé §7.1)

Le diagramme représente les capacités métier exposées par les routes et services.
Les conditions fines liées au propriétaire, au statut et à la prise en charge restent
portées par `workshop.policy.ts`.

```mermaid
flowchart LR
    OP((OPERATOR))
    MA((MAINTENANCE))
    RE((RESPONSABLE))
    AD((Administrateur))

    subgraph COMMUN[Atelier - fonctions communes aux trois rôles]
        W1[S'authentifier par badge]
        W2[Créer et consulter des incidents]
        W3[Consulter dashboard, pilotage et historique]
        W4[Consulter la base de connaissance]
        W5[Utiliser l'assistance]
        W6[Consulter le Board en lecture seule]
    end

    subgraph OPERATEUR[Actions OPERATOR]
        O1[Demander la correction de son incident actif]
        O2[Retirer sa demande de correction]
        O3[Demander l'annulation de son incident non pris]
    end

    subgraph MAINT[Actions MAINTENANCE]
        M1[Prendre un incident OPEN ou reprendre celui d'un autre technicien]
        M2[Modifier un incident non pris ou pris par soi]
        M3[Mettre en attente avec diagnostic]
        M4[Reprendre un incident PENDING]
        M5[Clôturer avec note d'intervention]
        M6[Annuler directement un incident actif non pris]
    end

    subgraph RESPONSABLE[Actions RESPONSABLE]
        R1[Modifier un incident actif]
        R2[Approuver ou refuser une correction]
        R3[Approuver ou refuser une annulation]
        R4[Définir la priorité et la consigne]
        R5[Suivre ou ne plus suivre un incident actif]
        R6[Consulter le Journal et les arbitrages]
        R7[Annuler un incident non pris ou PENDING]
        R8[Invalider une clôture avec motif]
    end

    subgraph ADMIN[Administration]
        A1[S'authentifier comme administrateur]
        A2[Gérer comptes, activation et accès atelier]
        A3[Gérer lignes et référentiel machines]
        A4[Traiter les demandes de réinitialisation]
        A5[Consulter qualité, audit référentiel et audit système]
        A6[Gérer sécurité, courriel et mot de passe admin]
        A7[Configurer sessions, notifications et Board]
        A8[Utiliser l'assistance administrateur]
    end

    OP --> W1
    OP --> W2
    OP --> W3
    OP --> W4
    OP --> W5
    OP --> W6
    OP --> O1
    OP --> O2
    OP --> O3

    MA --> W1
    MA --> W2
    MA --> W3
    MA --> W4
    MA --> W5
    MA --> W6
    MA --> M1
    MA --> M2
    MA --> M3
    MA --> M4
    MA --> M5
    MA --> M6

    RE --> W1
    RE --> W2
    RE --> W3
    RE --> W4
    RE --> W5
    RE --> W6
    RE --> R1
    RE --> R2
    RE --> R3
    RE --> R4
    RE --> R5
    RE --> R6
    RE --> R7
    RE --> R8

    AD --> A1
    AD --> A2
    AD --> A3
    AD --> A4
    AD --> A5
    AD --> A6
    AD --> A7
    AD --> A8
```

> Le Board accepte soit une session Board locale obtenue par code, soit une session
> Workshop valide. Il ne crée ni ne modifie d'incident. L'administrateur peut activer
> ou désactiver cet accès, renouveler son code et révoquer les sessions Board.

---

## 3. Diagramme de séquence — workflow nominal complet (référencé §7.2)

Chaque mutation est réalisée dans une transaction. La lecture `FOR UPDATE`, la
vérification par `canPerform`, la mutation et l'insertion de l'événement appartiennent
au même bloc transactionnel ; une exception provoque un `ROLLBACK`.

```mermaid
sequenceDiagram
    autonumber
    actor OP as Opérateur
    actor MA as Maintenance
    participant F as Frontend React
    participant C as Controller Express
    participant S as Service métier
    participant DB as PostgreSQL

    OP->>F: Saisit ligne, machine, robot, tête, état, produit et commentaire
    F->>C: POST /api/workshop/incidents
    C->>C: Validation Zod du corps
    C->>S: createIncidentService(données, userId, rôle)
    S->>DB: SELECT ligne active et machine_sequence
    DB-->>S: Ligne et configuration
    S->>S: Vérifie machine, robot et tête
    S->>DB: BEGIN
    S->>DB: INSERT workshop_incidents (status OPEN, is_taken false)
    DB-->>S: id incident
    S->>DB: INSERT workshop_incident_events (INCIDENT_CREATED)
    S->>DB: COMMIT
    S->>DB: SELECT incident enrichi
    DB-->>S: Incident créé
    S-->>C: ServiceResult ok
    C-->>F: 201 et incident
    F-->>OP: Confirmation de création

    MA->>F: Prendre en charge
    F->>C: PATCH /api/workshop/incidents/:id avec isTaken true
    C->>C: Validation Zod
    C->>S: takeIncidentService(id, userId, MAINTENANCE)
    S->>DB: BEGIN puis SELECT incident FOR UPDATE
    DB-->>S: Incident OPEN courant
    S->>S: canPerform(TAKE, acteur distinct si déjà pris)
    S->>DB: UPDATE prise en charge et snapshot technicien
    S->>DB: INSERT event INCIDENT_TAKEN
    S->>DB: COMMIT puis SELECT incident enrichi
    S-->>C: ServiceResult ok
    C-->>F: 200 et incident OPEN pris

    MA->>F: Mettre en attente avec un motif
    F->>C: PATCH /api/workshop/incidents/:id avec status PENDING et waitingReason
    C->>S: setPendingIncidentService
    S->>DB: BEGIN puis SELECT incident FOR UPDATE
    S->>S: canPerform(SET_PENDING) et motif non vide
    S->>DB: UPDATE status PENDING et waiting_reason
    S->>DB: INSERT event INCIDENT_SET_PENDING
    S->>DB: COMMIT puis SELECT incident enrichi
    C-->>F: 200 et incident PENDING

    MA->>F: Reprendre le traitement
    F->>C: PATCH /api/workshop/incidents/:id avec status OPEN
    C->>S: resumeIncidentService
    S->>DB: BEGIN puis SELECT incident FOR UPDATE
    S->>S: canPerform(RESUME)
    S->>DB: UPDATE status OPEN
    S->>DB: INSERT event INCIDENT_RESUMED
    S->>DB: COMMIT puis SELECT incident enrichi
    C-->>F: 200 et incident OPEN pris

    MA->>F: Clôturer avec une note d'intervention
    F->>C: PATCH /api/workshop/incidents/:id avec status CLOSED et interventionNote
    C->>S: closeIncidentService
    S->>DB: BEGIN puis SELECT incident FOR UPDATE
    S->>S: canPerform(CLOSE), statut non PENDING et note non vide
    S->>DB: UPDATE status CLOSED et note
    S->>DB: INSERT event INCIDENT_CLOSED
    S->>DB: COMMIT puis SELECT incident enrichi
    C-->>F: 200 et incident CLOSED
    F-->>MA: Incident visible dans l'historique et la connaissance

    Note over S,DB: En cas d'erreur SQL ou d'exception, withTransaction exécute ROLLBACK.
```

---

## 4. Diagramme d'états — cycle de vie de l'incident (référencé §7.3)

`OPEN_NON_PRIS` et `OPEN_PRIS` sont deux situations métier du même statut SQL
`OPEN`, distinguées par `is_taken`. Les demandes de correction et d'annulation
n'ajoutent pas un statut : elles restent des données d'arbitrage sur l'incident actif.

```mermaid
stateDiagram-v2
    [*] --> OPEN_NON_PRIS : création

    OPEN_NON_PRIS --> OPEN_PRIS : TAKE par MAINTENANCE
    OPEN_PRIS --> OPEN_PRIS : TAKE par une autre MAINTENANCE
    OPEN_PRIS --> PENDING : SET_PENDING avec motif
    PENDING --> OPEN_PRIS : RESUME par MAINTENANCE
    OPEN_PRIS --> CLOSED : CLOSE avec note d'intervention

    OPEN_NON_PRIS --> CANCELED : CANCEL par MAINTENANCE ou RESPONSABLE
    OPEN_NON_PRIS --> CANCELED : REQUEST_CANCEL puis APPROVE_CANCEL
    PENDING --> CANCELED : CANCEL par RESPONSABLE
    CLOSED --> INVALIDATED : INVALIDATE_CLOSED avec motif

    CANCELED --> [*]
    INVALIDATED --> [*]

    note right of OPEN_NON_PRIS
        Statut SQL OPEN
        is_taken = false
        REQUEST_CANCEL possible pour
        l'OPERATOR déclarant avec motif
    end note

    note right of OPEN_PRIS
        Statut SQL OPEN
        is_taken = true
        taken_by_user_id et taken_at renseignés
    end note

    note right of PENDING
        Statut SQL PENDING
        is_taken reste true
        CLOSE direct interdit : RESUME requis
    end note

    note right of CLOSED
        État résolu conservé dans l'historique
        Une invalidation RESPONSABLE reste possible
    end note
```

---

## 5. Flux d'authentification JWT et cookies (référencé §10.3)

### 5.1 Comptes Administration et Workshop

La réponse JSON ne contient jamais le JWT. Le navigateur le reçoit uniquement dans
un cookie `HttpOnly`. En production, les cookies sont aussi `Secure` et `SameSite=Strict`.

```mermaid
sequenceDiagram
    autonumber
    actor U as Utilisateur
    participant F as Frontend React
    participant API as API Express
    participant DB as PostgreSQL

    U->>F: Saisit identifiant ou numéro de badge
    F->>API: POST /api/auth/login avec identifier
    API->>DB: Recherche admin_accounts puis sentinel_users
    DB-->>API: Compte et état des identifiants
    API-->>F: requiresPassword ou requiresPasswordSetup

    alt Connexion standard Admin ou Workshop
        U->>F: Saisit le mot de passe
        F->>API: POST /api/auth/login avec identifier et password
        API->>API: bcrypt.compare
    else Premier accès Workshop
        U->>F: Saisit code temporaire et nouveau mot de passe
        F->>API: POST /api/auth/login avec identifier, setupCode et newPassword
        API->>API: Vérifie hash et expiration du code puis hash le mot de passe
        API->>DB: UPDATE password_hash et efface le code temporaire
    end

    API->>DB: Lit durée configurée et session_version courante
    alt Compte administrateur
        API->>API: Signe JWT adminId, username, sessionVersion
        API-->>F: Set-Cookie sentinel_admin_token et profil sans JWT
    else Compte atelier
        API->>API: Signe JWT userId, badgeNumber, role, sessionVersion
        API-->>F: Set-Cookie sentinel_workshop_token et profil sans JWT
    end

    F->>API: Requête protégée avec cookie automatique
    API->>API: Vérifie signature et expiration du JWT
    alt Cookie Administration
        API->>DB: Relit admin_accounts.session_version
    else Cookie Workshop
        API->>DB: Relit id, badge, rôle, is_active, is_deleted, password_hash et session_version
    end
    DB-->>API: État courant du compte
    alt Compte valide et version identique
        API-->>F: 200 et données autorisées
    else Compte révoqué, inactif, supprimé ou version différente
        API-->>F: 401 non autorisé
        F->>API: POST /api/auth/logout après interception du 401
        API-->>F: Clear-Cookie admin et Workshop
    end
```

### 5.2 Session locale du Board

```mermaid
sequenceDiagram
    autonumber
    actor U as Écran Board
    participant F as Frontend React
    participant API as API Express
    participant DB as PostgreSQL

    U->>F: Saisit le code local du Board
    F->>API: POST /api/board/session avec code
    API->>DB: Lit board_enabled, board_code_hash, board_session_version et durée
    DB-->>API: Paramètres Board
    API->>API: SHA-256 du code puis comparaison en temps constant
    API->>API: Signe JWT scope board, label, boardSessionVersion
    API-->>F: Set-Cookie sentinel_board_token HttpOnly et profil sans JWT

    loop Actualisation du Board
        F->>API: GET /api/board/data avec cookie
        API->>API: Vérifie signature, expiration et scope du JWT
        API->>DB: Relit activation et board_session_version
        DB-->>API: Paramètres courants
        alt Board actif et version identique
            API->>DB: SELECT lignes, incidents actifs et métriques
            DB-->>API: Données en lecture seule
            API-->>F: 200 et données Board
        else Board désactivé ou session révoquée
            API-->>F: 401 et suppression de sentinel_board_token
        end
    end

    Note over F,API: Une session Workshop valide donne aussi accès en lecture au Board sans créer un second cookie.
```

---

## Sources de vérification dans le dépôt

- structure et contraintes : `backend/migrations/001_create_admin_accounts.sql` à
  `backend/migrations/038_create_workshop_arbitration_consultations.sql` ;
- routes : `backend/src/server.ts`, `backend/src/modules/*/*.routes.ts` et
  `backend/src/modules/board/board.auth.ts` ;
- permissions : `backend/src/modules/workshop/workshop.policy.ts` ;
- transactions et événements : `backend/src/db/transaction.ts`,
  `backend/src/modules/workshop/workshop.service.edit.ts`,
  `backend/src/modules/workshop/workshop.service.mutations.ts` et
  `backend/src/modules/workshop/workshop.events.ts` ;
- sessions : `backend/src/modules/auth/`, `backend/src/middlewares/adminAuth.ts`,
  `backend/src/middlewares/workshopAuth.ts` et `backend/src/auth/authCookies.ts` ;
- routes d'interface : `frontend/src/App.tsx`, `frontend/src/routes/AdminRoute.tsx`,
  `frontend/src/routes/WorkshopRoute.tsx` et
  `frontend/src/routes/WorkshopResponsableRoute.tsx`.
