# Cadrage Fonctionnel — Sentinel

> Version du document : 1.0 — Mai 2026

---

## Sommaire

1. [Présentation générale](#1-présentation-générale)
2. [Acteurs et rôles](#2-acteurs-et-rôles)
3. [Architecture fonctionnelle](#3-architecture-fonctionnelle)
4. [Module Administration — Comptes utilisateurs](#4-module-administration--comptes-utilisateurs)
5. [Module Administration — Lignes de production](#5-module-administration--lignes-de-production)
6. [Module Administration — Journal d'audit](#6-module-administration--journal-daudit)
7. [Module Atelier — Authentification](#7-module-atelier--authentification)
8. [Module Atelier — Gestion des incidents](#8-module-atelier--gestion-des-incidents)
9. [Module Atelier — Dashboard opérationnel](#9-module-atelier--dashboard-opérationnel)
10. [Module Atelier — Board grand écran](#10-module-atelier--board-grand-écran)
11. [Module Atelier — Historique](#11-module-atelier--historique)
12. [Module Atelier — Pilotage](#12-module-atelier--pilotage)
13. [Module Atelier — Base de connaissance](#13-module-atelier--base-de-connaissance)
14. [Référentiel des statuts et états d'incident](#14-référentiel-des-statuts-et-états-dincident)
15. [Matrice des permissions par action](#15-matrice-des-permissions-par-action)
16. [Modèle de données synthétique](#16-modèle-de-données-synthétique)
17. [Routes et API](#17-routes-et-api)
18. [Règles métier transverses](#18-règles-métier-transverses)
19. [Sécurité et authentification](#19-sécurité-et-authentification)
20. [Stack technique](#20-stack-technique)

---

## 1. Présentation générale

**Sentinel** est une application full-stack de pilotage de production industrielle. Elle centralise la déclaration, le suivi et l'analyse des incidents d'atelier, ainsi que l'administration des utilisateurs et du référentiel de production.

### Objectifs principaux

| Objectif | Description |
|---|---|
| Traçabilité des incidents | Déclaration en temps réel des anomalies machine par les opérateurs |
| Suivi de prise en charge | Workflow de traitement par la maintenance et validation par le responsable |
| Visibilité opérationnelle | Board grand écran accessible sans connexion pour les équipes atelier |
| Analyse et pilotage | Indicateurs de performance sur période configurable |
| Base de connaissance | Capitalisation des interventions documentées pour référence future |
| Administration centralisée | Gestion des comptes et du référentiel ligne/machine par l'admin |

### Périmètre applicatif

```
Sentinel
├── Espace Admin
│   ├── Gestion des comptes atelier
│   ├── Gestion des lignes de production
│   └── Journal d'audit référentiel
└── Espace Atelier
    ├── Dashboard opérationnel (incidents actifs)
    ├── Board grand écran (sans session requise)
    ├── Historique
    ├── Pilotage (indicateurs)
    └── Base de connaissance
```

---

## 2. Acteurs et rôles

### 2.1 Administrateur (Admin)

Compte unique de niveau système, distinct des comptes atelier. Accessible via `/admin/login` avec identifiant et mot de passe.

**Responsabilités :**
- Création, modification, activation/désactivation et suppression des comptes atelier
- Création, modification, activation/désactivation et suppression des lignes de production
- Consultation du journal d'audit de toutes les opérations référentiel
- Vérification du mot de passe avant les actions sensibles (suppression)

### 2.2 Opérateur (`OPERATOR`)

Agent de production. Se connecte via badge numérique.

**Responsabilités :**
- Déclaration d'incidents sur les machines de sa ligne
- Demande de correction d'un incident déjà créé
- Demande d'annulation d'un incident non pris en charge

### 2.3 Maintenance (`MAINTENANCE`)

Technicien de maintenance. Se connecte via badge + mot de passe.

**Responsabilités :**
- Prise en charge d'un incident ouvert
- Renseignement du diagnostic
- Mise en attente avec justification
- Reprise d'un incident mis en attente
- Clôture d'un incident avec note d'intervention
- Annulation directe d'un incident non pris en charge

### 2.4 Responsable (`RESPONSABLE`)

Encadrant atelier. Se connecte via badge + mot de passe.

**Responsabilités :**
- Approbation ou refus des demandes de correction opérateur
- Approbation ou refus des demandes d'annulation opérateur
- Modification directe d'un incident non pris en charge
- Annulation directe d'un incident non pris en charge
- Marquage de la priorité (urgence) d'un incident
- Réordonnancement manuel des incidents prioritaires
- Ajout/modification de consigne responsable
- Invalidation d'un incident clôturé
- Consultation de toutes les vues (dashboard, historique, pilotage, connaissance)

---

## 3. Architecture fonctionnelle

### 3.1 Séparation des espaces

```
┌─────────────────────────────────────────────────────────────┐
│                        SENTINEL                             │
│                                                             │
│  ┌──────────────────────┐   ┌──────────────────────────┐   │
│  │    ESPACE ADMIN       │   │      ESPACE ATELIER       │   │
│  │                      │   │                           │   │
│  │  /admin/login        │   │  /workshop (login badge)  │   │
│  │  /admin/accueil      │   │  /workshop/dashboard      │   │
│  │  /admin/users        │   │  /workshop/board (public) │   │
│  │  /admin/users/:id    │   │  /workshop/history        │   │
│  │  /admin/lines        │   │  /workshop/pilotage       │   │
│  │  /admin/audit        │   │  /workshop/knowledge      │   │
│  └──────────────────────┘   └──────────────────────────┘   │
│                                                             │
│         JWT HTTP-only cookie (sessions séparées)            │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Couches backend

| Couche | Rôle |
|---|---|
| Routes | Déclaration des endpoints, protection par middleware |
| Controller | Validation Zod des entrées, mapping HTTP → service |
| Service | Logique métier, orchestration, vérification des permissions |
| Repository | Accès base de données (SQL paramétré) |
| Policy | Règles de permission par rôle et état |
| Events | Journalisation des actions importantes |

---

## 4. Module Administration — Comptes utilisateurs

### 4.1 Accès

Route protégée par `adminAuthMiddleware`. Accessible depuis `/admin/users`.

### 4.2 Fonctionnalités

#### Lister les comptes

Affichage de la liste complète des utilisateurs atelier (non supprimés).

Filtres disponibles :
- Recherche textuelle (prénom, nom, badge)
- Filtre par rôle (`OPERATOR`, `MAINTENANCE`, `RESPONSABLE`)
- Tri par nom alphabétique ou date de création

#### Créer un compte

Champs requis :
| Champ | Type | Contraintes |
|---|---|---|
| Prénom | Texte | ≥ 2 caractères |
| Nom | Texte | ≥ 2 caractères |
| Numéro de badge | Texte | 2–40 caractères, unique |
| Rôle | Enum | `OPERATOR` / `MAINTENANCE` / `RESPONSABLE` |

Comportement :
- Vérification d'unicité du badge avant création
- Événement d'audit `USER_CREATED` généré

#### Modifier un compte

Champs modifiables : prénom, nom, badge, rôle.

Contraintes :
- Si le badge change : vérification d'unicité
- Si le rôle change : vérification qu'aucun incident actif n'est pris en charge par cet utilisateur

#### Activer / Désactiver un compte

- Activation : toujours autorisée
- Désactivation : bloquée si l'utilisateur a des incidents actifs pris en charge
- Événements d'audit `USER_ACTIVATED` / `USER_DEACTIVATED`

#### Réinitialiser le mot de passe

- Efface le hash de mot de passe → l'utilisateur devra en définir un nouveau à sa prochaine connexion badge
- Événement d'audit `USER_PASSWORD_RESET`

#### Supprimer un compte (suppression logique)

- Bloquée si des incidents actifs sont encore pris en charge
- Suppression logique (`is_deleted = true`), les données sont conservées
- Confirmation par mot de passe admin requise (double authentification)
- Événement d'audit `USER_SOFT_DELETED`

#### Impact avant suppression

Route dédiée (`GET /accounts/:id/impact`) retournant le nombre d'incidents actifs liés à l'utilisateur.

### 4.3 Vérifications en temps réel

- `GET /accounts/check-badge?badge=XXX` : vérifie la disponibilité d'un numéro de badge lors de la saisie

---

## 5. Module Administration — Lignes de production

### 5.1 Accès

Route protégée par `adminAuthMiddleware`. Accessible depuis `/admin/lines`.

### 5.2 Structure d'une ligne

```
Ligne de production
├── Numéro de ligne (identifiant métier, unique)
├── Statut actif/inactif
└── Machines (1 à 10 par ligne)
    └── Machine
        ├── Identifiant machine (unique global)
        ├── Marque
        └── Configuration robot
            ├── Robot simple
            │   ├── Numéro de robot
            │   └── Nombre de têtes
            └── Double robot
                ├── Robot gauche (numéro + têtes)
                └── Robot droit (numéro + têtes)
```

### 5.3 Fonctionnalités

#### Lister les lignes

Affichage de toutes les lignes non supprimées avec leurs machines.

#### Créer une ligne

Champs requis :
| Champ | Type | Contraintes |
|---|---|---|
| Numéro de ligne | Texte | ≤ 40 caractères, unique |
| Statut initial | Booléen | Actif par défaut |
| Machines | Tableau | 1 à 10 machines |

Pour chaque machine :
| Champ | Contraintes |
|---|---|
| ID machine | Non vide, unique global |
| Marque | Non vide |
| Type robot | `simple` ou `double` |
| Numéro(s) robot | Non vide |
| Nombre de têtes | ≥ 1 par robot |

Événement d'audit `LINE_CREATED` généré.

#### Modifier une ligne

Types de modifications :
- **Informations générales** (résumé) : numéro de ligne, statut → événement `LINE_SUMMARY_UPDATED`
- **Machine** : modification d'une machine existante → événement `LINE_MACHINE_UPDATED`
- **Plan de ligne** : réorganisation de l'ordre des machines → événement `LINE_PLAN_UPDATED`
- **Modification globale** : toute autre combinaison → événement `LINE_UPDATED`

Contrainte de désactivation : bloquée si des incidents actifs sont liés à la ligne.

#### Supprimer une ligne (suppression logique)

- Bloquée si des incidents actifs sont liés à la ligne
- Confirmation par mot de passe admin requise
- Suppression logique (`is_deleted = true`)
- Événement d'audit `LINE_SOFT_DELETED`

#### Vérifications en temps réel

- `GET /lines/check-line?lineNumber=XXX` : disponibilité du numéro de ligne
- `POST /lines/check-line-conflicts` : détection de conflits d'identifiants machine

---

## 6. Module Administration — Journal d'audit

### 6.1 Accès

Route protégée. Accessible depuis `/admin/audit`.

### 6.2 Contenu du journal

Deux périmètres consolidés dans un journal unifié :

**Événements comptes utilisateurs :**
| Code | Libellé |
|---|---|
| `USER_CREATED` | Utilisateur créé |
| `USER_UPDATED` | Utilisateur modifié |
| `USER_ACTIVATED` | Utilisateur activé |
| `USER_DEACTIVATED` | Utilisateur désactivé |
| `USER_SOFT_DELETED` | Utilisateur supprimé |
| `USER_PASSWORD_RESET` | Mot de passe réinitialisé |

**Événements lignes de production :**
| Code | Libellé |
|---|---|
| `LINE_CREATED` | Ligne créée |
| `LINE_UPDATED` | Ligne mise à jour |
| `LINE_SUMMARY_UPDATED` | Informations ligne modifiées |
| `LINE_MACHINE_UPDATED` | Machine modifiée |
| `LINE_PLAN_UPDATED` | Ordre machines modifié |
| `LINE_SOFT_DELETED` | Ligne supprimée |

### 6.3 Filtres disponibles

- Périmètre : comptes / lignes / tout
- Groupe d'action : créations / mises à jour / activations / suppressions / accès
- Période : aujourd'hui / 7 jours / 30 jours / personnalisée (date début–fin)
- Ordre : chronologique ascendant ou descendant
- Recherche textuelle : sur nom, badge, numéro de ligne
- Limite : 250 événements par requête

---

## 7. Module Atelier — Authentification

### 7.1 Connexion par badge (mode Opérateur)

L'opérateur saisit uniquement son numéro de badge.

Cas particulier — premier accès :
- Si l'utilisateur n'a pas encore de mot de passe → le système retourne `requiresPasswordSetup: true`
- L'utilisateur définit un mot de passe (≥ 6 caractères) qui est stocké hashé (bcrypt)

Cas standard — badge seul :
- Si l'utilisateur a déjà un mot de passe → le système retourne `requiresPassword: true`
- L'utilisateur saisit son mot de passe pour finaliser la connexion

### 7.2 Connexion par badge + mot de passe (mode Maintenance / Responsable)

Les rôles `MAINTENANCE` et `RESPONSABLE` requièrent badge + mot de passe.

### 7.3 Session

- Token JWT signé, transporté via cookie HTTP-only (`sentinel-workshop-auth`)
- Validation de session via `GET /workshop/auth/me`
- Déconnexion via `POST /workshop/auth/logout`

### 7.4 Board public

La page `/workshop/board` est accessible **sans authentification**. Elle consomme `GET /workshop/board` qui est la seule route non protégée de l'espace atelier.

---

## 8. Module Atelier — Gestion des incidents

### 8.1 Modèle d'un incident

| Champ | Description |
|---|---|
| `shift` | Poste de travail : MATIN / APRES_MIDI / NUIT / WEEKEND |
| `line_id` / `line_number` | Ligne de production concernée |
| `machine_id` / `machine_brand` | Machine concernée |
| `robot_label` | Robot concerné (ex : "Gauche 01", "Droite 02") |
| `head_number` | Numéro de tête concernée (1 → max robots têtes) |
| `state` | Type d'anomalie (voir §14) |
| `comment` | Commentaire libre opérateur (≤ 1000 car.) |
| `current_product` | Référence produit en cours (≤ 120 car.) |
| `status` | Statut du workflow (voir §14) |
| `is_taken` | Pris en charge par maintenance |
| `taken_by_user_id` | Identifiant du technicien prenant en charge |
| `is_priority` | Marqué urgent par responsable |
| `display_order` | Ordre d'affichage manuel |
| `diagnostic` | Diagnostic renseigné par maintenance (≤ 1000 car.) |
| `intervention_note` | Note d'intervention à la clôture (≤ 1000 car.) |
| `responsible_comment` | Consigne responsable (≤ 500 car.) |
| `edit_request` | Payload de modification demandée (JSONB) |
| `cancel_request` | Annulation demandée par opérateur |
| `cancel_request_reason` | Motif de la demande d'annulation |

### 8.2 Workflow de vie d'un incident

```
                    ┌──────────────────┐
                    │   CRÉATION       │
                    │ (par OPERATOR,   │
                    │  MAINTENANCE ou  │
                    │  RESPONSABLE)    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
              ┌────►│      OPEN        │◄────┐
              │     └────────┬─────────┘     │
              │              │               │
              │         TAKE (MAINT.)   RESUME (MAINT.)
              │              │               │
              │              ▼               │
              │     ┌──────────────────┐     │
              │     │  OPEN + is_taken │     │
              │     └──────┬───────────┘     │
              │            │                 │
              │      SET_PENDING             │
              │            │                 │
              │            ▼                 │
              │     ┌──────────────────┐     │
              │     │    PENDING       │─────┘
              │     └──────┬───────────┘
              │            │
              │          CLOSE (MAINT. + note obligatoire)
              │            │
              │            ▼
              │     ┌──────────────────┐
              │     │     CLOSED       │
              │     └──────┬───────────┘
              │            │
              │   INVALIDATE_CLOSED (RESPONSABLE)
              │            │
              ▼            │
       ┌──────────────────┐│
       │   INVALIDATED    ││
       └──────────────────┘│

          CANCEL possible sur OPEN / PENDING non pris en charge
          → statut CANCELED (état terminal, conservé en BDD)
```

### 8.3 Actions et transitions

| Action | Acteur(s) | Prérequis | Résultat |
|---|---|---|---|
| Créer un incident | OPERATOR, MAINTENANCE, RESPONSABLE | Ligne active, machine valide, robot valide, tête valide | Incident OPEN |
| Demander une correction (`REQUEST_EDIT`) | OPERATOR | Incident actif (OPEN ou PENDING) | Payload `edit_request` stocké |
| Approuver correction (`APPROVE_EDIT`) | RESPONSABLE | Incident actif avec `edit_request` | Modification appliquée, `edit_request` effacé |
| Refuser correction (`REJECT_EDIT`) | RESPONSABLE | Incident actif avec `edit_request` | `edit_request` effacé |
| Modifier directement (`DIRECT_EDIT`) | MAINTENANCE, RESPONSABLE | Incident actif, non pris en charge | Champs mis à jour |
| Modifier après prise (`EDIT_AFTER_TAKE`) | MAINTENANCE | Incident actif pris en charge par soi-même | Champs descriptifs mis à jour |
| Demander annulation (`REQUEST_CANCEL`) | OPERATOR | Incident actif, non pris en charge | Flag `cancel_request = true` |
| Approuver annulation (`APPROVE_CANCEL`) | RESPONSABLE | `cancel_request = true` | Statut → CANCELED |
| Refuser annulation (`REJECT_CANCEL`) | RESPONSABLE | `cancel_request = true` | `cancel_request = false` |
| Annuler directement (`CANCEL`) | MAINTENANCE, RESPONSABLE | Incident actif, non pris en charge | Statut → CANCELED |
| Prendre en charge (`TAKE`) | MAINTENANCE | OPEN, non pris en charge | `is_taken = true`, `taken_by_user_id` renseigné |
| Mettre en attente (`SET_PENDING`) | MAINTENANCE | OPEN, pris en charge, diagnostic renseigné | Statut → PENDING |
| Reprendre (`RESUME`) | MAINTENANCE | PENDING, pris en charge | Statut → OPEN |
| Clôturer (`CLOSE`) | MAINTENANCE | OPEN, pris en charge, note d'intervention renseignée | Statut → CLOSED |
| Invalider (`INVALIDATE_CLOSED`) | RESPONSABLE | CLOSED | Statut → INVALIDATED, motif obligatoire |
| Marquer priorité (`SET_PRIORITY`) | RESPONSABLE | Incident actif | `is_priority` bascule |
| Réordonner (`REORDER`) | RESPONSABLE | Incident actif | `display_order` mis à jour |
| Consigne responsable (`RESPONSIBLE_COMMENT`) | RESPONSABLE | Incident actif | `responsible_comment` mis à jour |

### 8.4 Journalisation des événements incident

Chaque action génère un événement horodaté dans `workshop_incident_events` :

| Type d'événement | Déclencheur |
|---|---|
| `INCIDENT_CREATED` | Création |
| `EDIT_REQUESTED` | Demande de correction |
| `EDIT_APPLIED` | Correction approuvée |
| `EDIT_REJECTED` | Correction refusée |
| `CANCEL_REQUESTED` | Demande d'annulation |
| `CANCEL_REQUEST_REJECTED` | Annulation refusée |
| `INCIDENT_CANCELED` | Annulation appliquée |
| `INCIDENT_INVALIDATED` | Invalidation |
| `INCIDENT_TAKEN` | Prise en charge |
| `INCIDENT_SET_PENDING` | Mise en attente |
| `INCIDENT_RESUMED` | Reprise |
| `INCIDENT_CLOSED` | Clôture |
| `PRIORITY_CHANGED` | Changement de priorité |
| `ORDER_CHANGED` | Réordonnancement |
| `RESPONSIBLE_COMMENT_UPDATED` | Consigne responsable |

---

## 9. Module Atelier — Dashboard opérationnel

### 9.1 Accès

Nécessite une session atelier valide. Route : `/workshop/dashboard`.

### 9.2 Barre de métriques

Indicateurs affichés en temps réel :

| Indicateur | Description |
|---|---|
| Total actifs | Incidents OPEN + PENDING |
| Ouverts | Incidents OPEN |
| En attente | Incidents PENDING |
| Urgents | Incidents `is_priority = true` |
| Pris en charge | Incidents avec `is_taken = true` |
| Non pris | Incidents sans prise en charge |
| Ouverts > 7 jours | Ancienneté critique |

### 9.3 Liste des incidents

Tri par défaut : urgents en premier (`is_priority DESC`), puis par ordre d'affichage (`display_order DESC`), puis non pris en charge en premier, puis par date de création décroissante.

**Filtres rapides (barre principale) :**
- Statut : ouverts / en attente / clôturés récents (7 j) / tout
- Ancienneté : ouverts > 7 jours

**Filtres secondaires (panneau extensible) :**
- Ligne de production
- Priorité : urgents / non urgents
- Prise en charge : pris / non pris

**Recherche texte libre** sur : commentaire, diagnostic, note d'intervention, machine, ligne, produit, opérateur.

### 9.4 Carte incident

Chaque incident est affiché dans une carte présentant :
- Identifiant, statut, ancienneté, poste
- Ligne / machine / robot / tête / état
- Indicateurs urgence et prise en charge
- Actions contextuelles selon rôle et état

### 9.5 Réordonnancement par glisser-déposer

Le responsable peut réordonner manuellement les incidents prioritaires par drag-and-drop avec défilement automatique.

### 9.6 Modales d'action

| Modale | Déclencheur |
|---|---|
| `CreateIncidentModal` | Créer un nouvel incident |
| `EditSummaryModal` | Modifier directement / demander correction |
| `ReviewIncidentRequestModal` | Approuver / refuser une demande |
| `TakeChargeConfirmModal` | Prendre en charge |
| `PendingConfirmModal` | Mettre en attente (saisie diagnostic) |
| `CloseIncidentModal` | Clôturer (saisie note d'intervention) |
| `DeleteRequestModal` | Demander l'annulation (saisie motif) |
| `MaintenanceDeleteConfirmModal` | Annuler directement (maintenance/responsable) |
| `InvalidateIncidentModal` | Invalider un incident clôturé |

---

## 10. Module Atelier — Board grand écran

### 10.1 Accès

**Aucune session requise.** Accessible depuis `/workshop/board`. Conçu pour un affichage permanent en atelier.

### 10.2 Modes d'affichage

Le board tourne automatiquement entre trois vues toutes les 12 secondes :

| Vue | Contenu |
|---|---|
| `alerts` | Incidents prioritaires et/ou non pris en charge |
| `all` | Tous les incidents actifs (OPEN + PENDING) |
| `lines` | Synthèse par ligne (comptage incidents, urgences, état) |

Pagination : 9 incidents par page.

### 10.3 Modes de surveillance

| Mode | Description |
|---|---|
| `normal` | Affichage standard |
| `watch` | Accentuation des incidents critiques |
| `critical` | Alerte visuelle maximale |

### 10.4 Presets de configuration

| Preset | Description |
|---|---|
| Standard | Vue par défaut équilibrée |
| Maintenance | Focus sur les non pris en charge |
| Responsables | Focus sur les urgences |
| Personnalisé | Configuration manuelle |

### 10.5 Paramètres configurables par écran

- Affichage des alertes (oui/non)
- Affichage des incidents ouverts (oui/non)
- Synthèse par ligne (oui/non)
- Urgences seulement (oui/non)
- Non pris en charge seulement (oui/non)
- Filtrage par ligne(s)

Les paramètres sont **persistés par écran** (`localStorage`) avec un identifiant d'écran configurable via le paramètre URL `?screen=nom-ecran`.

### 10.6 Informations affichées par incident

Ligne, machine, robot, tête, type d'anomalie, produit en cours, ancienneté, statut (pris/non pris/en attente), indicateur d'urgence.

---

## 11. Module Atelier — Historique

### 11.1 Accès

Nécessite une session atelier valide. Route : `/workshop/history`.

### 11.2 Deux vues complémentaires

#### Vue incidents

Liste paginée (250 max) de tous les incidents (tous statuts).

Filtres :
- Recherche textuelle (commentaire, diagnostic, note, machine, ligne, produit, opérateur)
- Statut : OPEN / PENDING / CLOSED / CANCELED
- Type d'anomalie
- Ligne / Machine

Sélection d'un incident → affichage du détail complet + timeline des événements.

#### Vue journal d'événements

Flux chronologique (80 événements max) des actions réalisées sur les incidents.

Filtres supplémentaires :
- Type d'événement (filtrage par code d'événement)

Chaque ligne de journal inclut : type d'action, acteur (prénom, nom, badge, rôle), incident concerné, horodatage.

### 11.3 Navigation croisée

Cliquer sur un événement du journal navigue vers l'incident correspondant avec mise en surbrillance de l'événement.

---

## 12. Module Atelier — Pilotage

### 12.1 Accès

Nécessite une session atelier valide. Route : `/workshop/pilotage`.

### 12.2 Sélection de période

| Option | Description |
|---|---|
| Aujourd'hui | Journée en cours |
| 7 jours | Semaine glissante (défaut) |
| 30 jours | Mois glissant |
| Tout | Depuis l'origine |
| Personnalisée | Date début et fin libres |

### 12.3 Filtres de périmètre

- Ligne de production
- Machine (liste dépendante de la ligne sélectionnée)

### 12.4 Indicateurs KPI

| KPI | Description |
|---|---|
| Charge active | Incidents OPEN + PENDING |
| Taux de clôture | Clôturés / Total (%) |
| Part urgences | Incidents prioritaires / Total (%) |
| Urgences non prises | Incidents urgents sans prise en charge |
| Incidents > 7 jours | Ouverts depuis plus de 7 jours |
| Délai médian de prise en charge | Médiane du délai OPEN → TAKE (secondes) |
| Délai moyen de prise en charge | Moyenne du délai OPEN → TAKE (secondes) |
| Délai médian de clôture | Médiane du délai OPEN → CLOSE (secondes) |
| Délai moyen de clôture | Moyenne du délai OPEN → CLOSE (secondes) |
| Incident le plus ancien | Durée depuis la création du plus ancien incident actif |

### 12.5 Tendances temporelles

Graphique en barres comparatives (créés vs clôturés) par période, avec :
- Total créations sur la période
- Total clôtures sur la période
- Total urgences
- Delta backlog (créés − clôturés)

### 12.6 Classements

- Classement des lignes les plus impactées (nombre d'incidents)
- Classement des machines les plus impactées
- Répartition par type d'anomalie

### 12.7 Synthèse textuelle automatique

Génération d'un résumé narratif automatique décrivant la situation opérationnelle : charge active, statut (stable / à surveiller / sous tension), urgences non traitées, ligne et machine dominantes.

---

## 13. Module Atelier — Base de connaissance

### 13.1 Accès

Nécessite une session atelier valide. Route : `/workshop/knowledge`.

### 13.2 Contenu

Regroupe uniquement les incidents **clôturés** avec une **note d'intervention renseignée et non vide**. Constitue un référentiel de résolutions documentées.

### 13.3 Filtres disponibles

- Recherche textuelle (commentaire, diagnostic, note, machine, ligne, produit)
- Ligne / Machine
- Type d'anomalie

### 13.4 Fiche connaissance

Sélection d'un incident → affichage du détail complet :
- Contexte : ligne, machine, robot, tête, produit en cours, poste, type d'anomalie
- Diagnostic du technicien
- Note d'intervention
- Opérateur déclarant et technicien ayant clôturé
- Horodatages

### 13.5 Indicateurs de synthèse

| Indicateur | Description |
|---|---|
| Nombre de fiches | Total des incidents clôturés documentés |
| Machines couvertes | Nombre de machines distinctes référencées |
| Dernière fiche ajoutée | Date de la clôture la plus récente |

### 13.6 Navigation par URL

Paramètre `?incident=ID` permettant d'accéder directement à une fiche depuis un lien externe (historique, communication interne).

---

## 14. Référentiel des statuts et états d'incident

### 14.1 Statuts (cycle de vie)

| Code | Libellé | Description |
|---|---|---|
| `OPEN` | Ouvert | Incident actif, en attente de traitement ou en cours |
| `PENDING` | En attente | En cours de diagnostic, technicien en attente de pièces ou informations |
| `CLOSED` | Clôturé | Intervention terminée et documentée |
| `CANCELED` | Annulé | Annulé avant clôture — conservé en base, exclu des métriques opérationnelles |
| `INVALIDATED` | Invalidé | Clôture invalidée après coup par responsable — conservé en base, exclu des métriques opérationnelles et de la connaissance |

Statuts actifs (inclus dans les métriques) : `OPEN` et `PENDING`.

### 14.2 Types d'anomalie (états)

| Code | Libellé |
|---|---|
| `SKIPEE_PAR_MACHINE` | Skipée par machine |
| `SKIPEE_PAR_CONDUCTEUR` | Skipée par conducteur |
| `DEGRADEE` | Dégradée |
| `INDISPONIBLE` | Indisponible |

### 14.3 Postes de travail (shifts)

| Code | Libellé |
|---|---|
| `MATIN` | Matin |
| `APRES_MIDI` | Après-midi |
| `NUIT` | Nuit |
| `WEEKEND` | Week-end |

---

## 15. Matrice des permissions par action

| Action | OPERATOR | MAINTENANCE | RESPONSABLE |
|---|:---:|:---:|:---:|
| Créer un incident | ✓ | ✓ | ✓ |
| Demander correction | ✓ (actif) | — | — |
| Demander annulation | ✓ (actif, non pris) | — | — |
| Modifier directement | — | ✓ (actif, non pris) | ✓ (actif, non pris) |
| Modifier après prise | — | ✓ (actif, pris par soi-même) | — |
| Annuler directement | — | ✓ (actif, non pris) | ✓ (actif, non pris) |
| Approuver correction | — | — | ✓ (actif, edit_request=true) |
| Refuser correction | — | — | ✓ (actif, edit_request=true) |
| Approuver annulation | — | — | ✓ (cancel_request=true) |
| Refuser annulation | — | — | ✓ (cancel_request=true) |
| Prendre en charge | — | ✓ (OPEN, non pris) | — |
| Mettre en attente | — | ✓ (OPEN, pris) | — |
| Reprendre | — | ✓ (PENDING, pris) | — |
| Clôturer | — | ✓ (OPEN, pris) | — |
| Invalider clôture | — | — | ✓ (CLOSED) |
| Marquer priorité | — | — | ✓ (actif) |
| Réordonner | — | — | ✓ (actif) |
| Consigne responsable | — | — | ✓ (actif) |

---

## 16. Modèle de données synthétique

### 16.1 Tables principales

```
admin_accounts
├── id, username, password_hash
└── created_at

sentinel_users
├── id, first_name, last_name, badge_number (unique)
├── role (OPERATOR | MAINTENANCE | RESPONSABLE)
├── is_active, is_deleted
├── password_hash (nullable, défini au premier login)
└── created_at, updated_at

production_lines
├── id, line_number (unique)
├── machines (JSONB — tableau de machines)
├── is_active, is_deleted
└── created_at, updated_at

workshop_incidents
├── id
├── user_id → sentinel_users (déclarant)
├── shift, line_id, line_number
├── machine_id, machine_brand, robot_label, head_number
├── state, status
├── comment, current_product
├── is_taken, taken_by_user_id → sentinel_users, taken_at
├── is_priority, display_order
├── diagnostic, intervention_note, responsible_comment
├── edit_request (JSONB), cancel_request, cancel_request_reason
└── created_at, updated_at

workshop_incident_followers
├── id, incident_id → workshop_incidents
├── user_id → sentinel_users
├── created_at
└── deleted_at (désabonnement logique)

workshop_incident_events
├── id, incident_id → workshop_incidents
├── actor_user_id → sentinel_users (obligatoire)
├── event_type, payload (JSONB)
└── created_at

account_audit_events
├── id, target_user_id → sentinel_users
├── admin_id → admin_accounts
├── event_type, changes (JSONB)
└── created_at

line_audit_events
├── id, line_id → production_lines
├── admin_id → admin_accounts
├── event_type, changes (JSONB)
└── created_at
```

---

## 17. Routes et API

### 17.1 Administration

| Méthode | Route | Description |
|---|---|---|
| `POST` | `/admin/auth/login` | Connexion admin |
| `GET` | `/admin/auth/me` | Session courante |
| `POST` | `/admin/auth/logout` | Déconnexion |
| `POST` | `/admin/auth/verify-password` | Vérification mot de passe admin |
| `GET` | `/admin/accounts` | Liste des utilisateurs |
| `GET` | `/admin/accounts/check-badge` | Vérification disponibilité badge |
| `POST` | `/admin/accounts` | Créer un utilisateur |
| `GET` | `/admin/accounts/:id` | Détail utilisateur |
| `GET` | `/admin/accounts/:id/impact` | Impact avant suppression |
| `PATCH` | `/admin/accounts/:id` | Modifier un utilisateur |
| `PATCH` | `/admin/accounts/:id/activate` | Activer |
| `PATCH` | `/admin/accounts/:id/deactivate` | Désactiver |
| `PATCH` | `/admin/accounts/:id/reset-password` | Réinitialiser mot de passe |
| `DELETE` | `/admin/accounts/:id` | Supprimer (logique) |
| `GET` | `/admin/lines` | Liste des lignes |
| `GET` | `/admin/lines/check-line` | Vérification numéro de ligne |
| `POST` | `/admin/lines/check-line-conflicts` | Vérification conflits machine |
| `POST` | `/admin/lines` | Créer une ligne |
| `GET` | `/admin/lines/:id` | Détail ligne |
| `GET` | `/admin/lines/:id/impact` | Impact avant suppression |
| `PATCH` | `/admin/lines/:id` | Modifier une ligne |
| `DELETE` | `/admin/lines/:id` | Supprimer (logique) |
| `GET` | `/admin/audit` | Journal d'audit référentiel |

### 17.2 Atelier

| Méthode | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/workshop/auth/login` | Aucune | Connexion badge |
| `POST` | `/workshop/auth/logout` | Aucune | Déconnexion |
| `GET` | `/workshop/auth/me` | Session | Session courante |
| `GET` | `/workshop/board` | **Aucune** | Données board public |
| `GET` | `/workshop/lines` | Session | Lignes actives |
| `GET` | `/workshop/incidents` | Session | Incidents actifs ; pour RESPONSABLE, inclut aussi les cas terminaux encore suivis |
| `POST` | `/workshop/incidents` | Session | Créer un incident |
| `POST` | `/workshop/incidents/reorder` | Session | Réordonner atomiquement une liste d'incidents actifs |
| `POST` | `/workshop/incidents/:id/follow` | Session | Suivre un incident (RESPONSABLE) |
| `DELETE` | `/workshop/incidents/:id/follow` | Session | Arrêter le suivi d'un incident (RESPONSABLE) |
| `POST` | `/workshop/incidents/:id/cancel` | Session | Annuler un incident |
| `PATCH` | `/workshop/incidents/:id` | Session | Mettre à jour un incident |
| `DELETE` | `/workshop/incidents/:id` | Session | Compatibilité ancienne API : annuler un incident |
| `GET` | `/workshop/incidents/:id/events` | Session | Événements d'un incident |
| `GET` | `/workshop/metrics` | Session | Métriques temps réel |
| `GET` | `/workshop/analytics` | Session | Indicateurs pilotage |
| `GET` | `/workshop/history/incidents` | Session | Historique incidents |
| `GET` | `/workshop/history/incidents/:id` | Session | Détail incident historique |
| `GET` | `/workshop/history/events` | Session | Journal d'événements |
| `GET` | `/workshop/knowledge/incidents` | Session | Base de connaissance |
| `GET` | `/workshop/knowledge/incidents/:id` | Session | Fiche connaissance |

---

## 18. Règles métier transverses

### 18.1 Intégrité des références

- Un numéro de badge est **unique** dans `sentinel_users`
- Un numéro de ligne est **unique** dans `production_lines`
- Un identifiant de machine est **unique** dans l'ensemble des lignes actives
- Les données ne sont jamais supprimées physiquement (soft delete)

### 18.2 Blocages opérationnels

| Opération | Condition de blocage |
|---|---|
| Désactiver un utilisateur | Incidents actifs (`OPEN` ou `PENDING`) encore pris en charge par cet utilisateur |
| Supprimer un utilisateur | Même condition que désactivation |
| Changer le rôle d'un utilisateur | Incidents actifs encore pris en charge par cet utilisateur |
| Désactiver une ligne | Incidents actifs liés à cette ligne |
| Supprimer une ligne | Incidents actifs liés à cette ligne |

### 18.3 Contraintes de workflow incident

- La **mise en attente** (`SET_PENDING`) nécessite un diagnostic renseigné
- La **clôture** (`CLOSE`) nécessite une note d'intervention renseignée
- La clôture directe depuis le statut `PENDING` est **interdite** (il faut reprendre → `RESUME` puis clôturer)
- L'**invalidation** d'un incident clôturé nécessite un motif
- La demande d'annulation opérateur nécessite un motif

### 18.4 Métriques

- Les incidents `CANCELED` et `INVALIDATED` sont **exclus** des métriques opérationnelles
- L'ancienneté critique est définie à **7 jours** pour les incidents OPEN
- L'ordre d'affichage respecte : priorité → ordre manuel → non pris en charge → date de création

---

## 19. Sécurité et authentification

### 19.1 Sessions

- Deux systèmes de sessions indépendants : admin (`sentinel-admin-auth`) et atelier (`sentinel-workshop-auth`)
- Tokens JWT, transportés exclusivement via **cookies HTTP-only** (non accessible en JavaScript)
- Secrets JWT configurés via variables d'environnement

### 19.2 Protection des routes backend

- `adminAuthMiddleware` : valide le token admin sur toutes les routes `/admin/**` (sauf login)
- `workshopAuthMiddleware` : valide le token atelier sur toutes les routes `/workshop/**` (sauf login, logout et board)
- La route `/workshop/board` est intentionnellement publique

### 19.3 Mots de passe

- Mots de passe admin : hashés (bcrypt)
- Mots de passe atelier : hashés (bcrypt, facteur 10), définis au premier login badge
- Les opérateurs sans rôle sensible (OPERATOR) n'ont pas de mot de passe requis — badge seul

### 19.4 Validation des entrées

- Toutes les entrées API sont validées via des schémas **Zod** côté backend avant tout traitement
- Les paramètres de filtres SQL utilisent des requêtes **paramétrées** (protection injection SQL)
- Les statuts et états sont validés contre les constantes du domaine

### 19.5 Vérification du mot de passe admin pour les actions sensibles

La route `POST /admin/auth/verify-password` permet de confirmer le mot de passe admin avant les opérations destructives (suppression utilisateur, suppression ligne) sans rouvrir de session.

---

## 20. Stack technique

### 20.1 Frontend

| Technologie | Rôle |
|---|---|
| React 18 | Framework UI |
| TypeScript | Typage statique |
| Vite | Bundler et serveur de développement |
| React Router | Navigation SPA |
| Validation HTML/TypeScript | Validation côté interface et contraintes de formulaire |

### 20.2 Backend

| Technologie | Rôle |
|---|---|
| Node.js | Runtime |
| Express | Framework HTTP |
| TypeScript | Typage statique |
| Zod | Validation des schémas API |
| bcrypt | Hachage des mots de passe |
| jsonwebtoken | Génération et vérification JWT |
| node-postgres (pg) | Client PostgreSQL |

### 20.3 Base de données

| Technologie | Rôle |
|---|---|
| PostgreSQL | Base de données relationnelle |
| Migrations SQL | Gestion des évolutions de schéma (019 migrations) |
| JSONB | Stockage des payloads flexibles (edit_request, payload événements, machines) |

### 20.4 Infrastructure

| Composant | Configuration |
|---|---|
| Docker Compose | Orchestration des conteneurs frontend, backend, PostgreSQL |
| Nginx | Serveur statique frontend en production |
| Variables d'environnement | Configuration des secrets et URLs (`.env`) |

### 20.5 Ports par défaut (développement)

| Service | Port |
|---|---|
| Frontend (Vite) | 5173 |
| Backend (Express) | 3000 |
| PostgreSQL | 5432 |

---

*Document généré à partir de l'analyse du code source de Sentinel v1 — Mai 2026.*
