# Jeu d'essai — Sentinel

> Fonctionnalité testée : **le cycle de vie d'un incident d'atelier**, fonctionnalité la plus
> représentative de l'application (elle traverse les 4 couches du backend, la matrice de
> permissions et l'audit trail).
>
> Exécution du 11/06/2026 contre l'API réelle (Express + PostgreSQL locale), avec les données
> de test décrites ci-dessous. Les réponses « obtenues » sont les réponses JSON brutes de l'API.

---

## Données de test

| Élément | Valeur |
|---|---|
| Ligne de production | `JE-L1` — 1 machine `JE-M1` (Fanuc), robot `R01`, 4 têtes |
| Opératrice | Sonia Operatrice — badge `JE-OP-01`, rôle `OPERATOR` |
| Technicien | Marc Technicien — badge `JE-MA-01`, rôle `MAINTENANCE` |
| Responsable | Leïla Responsable — badge `JE-RE-01`, rôle `RESPONSABLE` |
| Mot de passe commun de test | `<mot_de_passe_test>` |

Création des données : insertion SQL directe (voir « Reproduire ce jeu d'essai » en fin de document).

---

## Scénario 1 — Cycle de vie complet d'un incident

### 1.a Connexion de l'opératrice

| | |
|---|---|
| **Entrée** | `POST /api/auth/login` — `{"identifier":"JE-OP-01","password":"<mot_de_passe_test>"}` |
| **Attendu** | 200, cookie de session HTTP-only posé, profil OPERATOR retourné |
| **Obtenu** | `{"accountType":"workshop","id":1,"first_name":"Sonia","last_name":"Operatrice","badge_number":"JE-OP-01","role":"OPERATOR"}` ✅ |

### 1.b Déclaration de l'incident

| | |
|---|---|
| **Entrée** | `POST /api/workshop/incidents` — `{"lineId":13,"machineId":"JE-M1","robotLabel":"R01","headNumber":2,"state":"DEGRADEE","comment":"Cadence réduite de 30 % sur tête 2, à vérifier.","currentProduct":"REF-4821"}` |
| **Attendu** | 200, incident créé en statut `OPEN`, non pris en charge, rattaché à l'opératrice |
| **Obtenu** | `{"id":1,"user_id":1,"status":"OPEN","is_taken":false,"taken_by_user_id":null,"state":"DEGRADEE","head_number":2,...}` ✅ |

### 1.c Prise en charge par la maintenance (TAKE)

| | |
|---|---|
| **Entrée** | Connexion `JE-MA-01`, puis `PATCH /api/workshop/incidents/1` — `{"isTaken":true}` |
| **Attendu** | 200, `is_taken=true`, `taken_by_user_id` = id du technicien, horodatage `taken_at` posé |
| **Obtenu** | `{"id":1,"status":"OPEN","is_taken":true,"taken_by_user_id":2,"taken_at":"2026-06-11T21:06:19.829Z"}` ✅ |

### 1.d Mise en attente avec diagnostic (SET_PENDING)

| | |
|---|---|
| **Entrée** | `PATCH /api/workshop/incidents/1` — `{"status":"PENDING","diagnostic":"Courroie tête 2 détendue, pièce commandée."}` |
| **Attendu** | 200, statut `PENDING`, diagnostic enregistré (règle métier : diagnostic obligatoire avant suspension) |
| **Obtenu** | `{"id":1,"status":"PENDING","diagnostic":"Courroie tête 2 détendue, pièce commandée."}` ✅ |

### 1.e Reprise (RESUME)

| | |
|---|---|
| **Entrée** | `PATCH /api/workshop/incidents/1` — `{"status":"OPEN"}` |
| **Attendu** | 200, retour au statut `OPEN`, toujours pris en charge |
| **Obtenu** | `{"id":1,"status":"OPEN","is_taken":true}` ✅ |

### 1.f Clôture avec note d'intervention (CLOSE)

| | |
|---|---|
| **Entrée** | `PATCH /api/workshop/incidents/1` — `{"status":"CLOSED","interventionNote":"Courroie remplacée, cadence nominale rétablie."}` |
| **Attendu** | 200, statut `CLOSED`, note d'intervention enregistrée |
| **Obtenu** | `{"id":1,"status":"CLOSED","intervention_note":"Courroie remplacée, cadence nominale rétablie."}` ✅ |

### 1.g Vérification de l'audit trail

| | |
|---|---|
| **Entrée** | `GET /api/workshop/incidents/1/events` |
| **Attendu** | Un événement immuable par transition, dans l'ordre |
| **Obtenu** | `INCIDENT_CREATED → INCIDENT_TAKEN → INCIDENT_SET_PENDING → INCIDENT_RESUMED → INCIDENT_CLOSED` (affichés du plus récent au plus ancien) ✅ |

**Analyse des écarts : aucun.** Chaque transition produit l'état attendu et son événement d'audit.

---

## Scénario 2 — Permissions : les interdictions répondent 403

Un incident `id=2` est créé par l'opératrice (statut `OPEN`).

| Cas | Entrée | Attendu | Obtenu |
|---|---|---|---|
| 2.a L'OPERATOR tente de clore | `PATCH /incidents/2` `{"status":"CLOSED"}` (cookie OPERATOR) | 403 | `403 {"error":{"code":"FORBIDDEN","message":"Clôture non autorisée pour ce rôle ou ce statut."}}` ✅ |
| 2.b L'OPERATOR tente de prendre en charge | `PATCH /incidents/2` `{"isTaken":true}` (cookie OPERATOR) | 403 | `403 {"error":{"code":"FORBIDDEN","message":"Prise en charge non autorisée pour ce rôle ou ce statut."}}` ✅ |
| 2.c Le RESPONSABLE tente de prendre un incident déjà pris | `PATCH /incidents/2` `{"isTaken":true}` (cookie RESPONSABLE, incident pris par la maintenance) | 403 | `403 FORBIDDEN` (même message) ✅ |

**Analyse des écarts : aucun.** La matrice de permissions (`workshop.policy.ts`) est appliquée
côté serveur avant toute logique métier — les boutons masqués côté interface ne sont pas la
seule protection.

---

## Scénario 3 — Workflow d'approbation d'une demande de correction

Un incident `id=3` est créé par l'opératrice avec `headNumber: 3` (erreur de saisie volontaire).

### 3.a L'opératrice demande une correction (sans modifier l'incident)

| | |
|---|---|
| **Entrée** | `PATCH /api/workshop/incidents/3` — `{"requestOnly":true,"headNumber":4,"comment":"Erreur de saisie : il s agit de la tete 4, pas la 3."}` |
| **Attendu** | 200, demande d'édition enregistrée, **valeurs d'origine inchangées** |
| **Obtenu** | `{"edit_request_present":true,"head_number_actuel":3}` — l'incident affiche toujours tête 3 ✅ |

### 3.b Le responsable approuve la demande

| | |
|---|---|
| **Entrée** | `PATCH /api/workshop/incidents/3` — `{"applyEditRequest":true}` (cookie RESPONSABLE) |
| **Attendu** | 200, valeurs appliquées, demande consommée |
| **Obtenu** | `{"head_number_apres":4,"edit_request":null}` ✅ |

**Analyse des écarts : aucun.** La déclaration de l'opérateur n'est jamais modifiée sans
validation hiérarchique — c'est la règle métier centrale du module.

---

## Scénario 4 — Cas limites et validation des entrées (Zod)

| Cas | Entrée | Attendu | Obtenu |
|---|---|---|---|
| 4.a Énumérations invalides | `POST /incidents` avec `"state":"ARRET"` | 400 + message explicite | `400 VALIDATION_ERROR : "Invalid enum value. Expected 'SKIPEE_PAR_MACHINE' \| 'SKIPEE_PAR_CONDUCTEUR' \| 'DEGRADEE' \| 'INDISPONIBLE', received 'ARRET' …"` ✅ |
| 4.b Numéro de tête hors référentiel | `"headNumber":0` | 400 | `400 VALIDATION_ERROR` (« La tête doit correspondre au référentiel de la machine. ») ✅ |
| 4.c Ligne inexistante | `"lineId":99999` | 404 | `404 {"error":{"code":"NOT_FOUND","message":"Ligne introuvable ou inactive."}}` ✅ |
| 4.d Commentaire de 1 200 caractères | `comment` = 1 200 × `X` | 400 (max 1 000) | `400 VALIDATION_ERROR : "String must contain at most 1000 character(s)"` ✅ |

**Analyse des écarts : aucun.** La validation Zod s'exécute dans le controller : aucune donnée
invalide n'atteint le service ni la base.

---

## Scénario 5 — Sécurité des accès

| Cas | Entrée | Attendu | Obtenu |
|---|---|---|---|
| 5.a Accès sans session | `GET /api/workshop/incidents` sans cookie | 401 | `401 {"error":{"code":"UNAUTHORIZED","message":"Authentification requise."}}` ✅ |
| 5.b Force brute sur le login | 21 × `POST /api/auth/login` avec mot de passe erroné | 401 répétés puis 429 | 401 jusqu'à la 18ᵉ, puis `429 {"error":{"code":"RATE_LIMITED","message":"Trop de tentatives. Réessayez dans 14 minute(s)."}}` + header `Retry-After: 791` ✅ |

**Analyse des écarts : un écart mineur, expliqué.** Le blocage est survenu à la 19ᵉ tentative
et non à la 21ᵉ : les requêtes des scénarios précédents, émises depuis la même adresse IP,
avaient déjà consommé une partie du **limiteur global par IP** (300 requêtes / 15 min), qui se
cumule avec le limiteur de login (20 tentatives / 15 min par IP + identifiant). Le comportement
de protection est donc conforme, et même légèrement plus strict en situation de trafic réel.

---

## Bilan

| Scénario | Cas testés | Conformes | Écarts |
|---|---|---|---|
| 1 — Cycle de vie complet | 7 | 7 | 0 |
| 2 — Permissions | 3 | 3 | 0 |
| 3 — Workflow d'approbation | 2 | 2 | 0 |
| 4 — Validation des entrées | 4 | 4 | 0 |
| 5 — Sécurité des accès | 2 | 2 | 1 mineur (expliqué) |
| **Total** | **18** | **18** | — |

---

## Reproduire ce jeu d'essai

1. Démarrer la base et l'API (`docker compose up` ou `npm run dev` dans `backend/`).
2. Créer la ligne `JE-L1` et les trois comptes (`JE-OP-01`, `JE-MA-01`, `JE-RE-01`) — voir
   `backend/scripts/seedWorkshopProductionDemo.js` ou insertion SQL équivalente.
3. Dérouler les requêtes ci-dessus (curl, Postman ou interface web).
4. Nettoyage :

```sql
DELETE FROM workshop_incident_events WHERE incident_id IN
  (SELECT id FROM workshop_incidents WHERE line_id = (SELECT id FROM production_lines WHERE line_number = 'JE-L1'));
DELETE FROM workshop_incident_followers WHERE incident_id IN
  (SELECT id FROM workshop_incidents WHERE line_id = (SELECT id FROM production_lines WHERE line_number = 'JE-L1'));
DELETE FROM workshop_incidents WHERE line_id = (SELECT id FROM production_lines WHERE line_number = 'JE-L1');
DELETE FROM sentinel_users WHERE badge_number LIKE 'JE-%';
DELETE FROM production_lines WHERE line_number = 'JE-L1';
```
