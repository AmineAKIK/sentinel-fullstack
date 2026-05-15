# Tests manuels essentiels – Sentinel

Checklist à valider à chaque livraison ou pull-request importante.
Cocher chaque point **dans l'ordre** ; les dépendances sont indiquées.

---

## 1. Board non connecté

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1.1 | Ouvrir `/workshop/board` sans être connecté au workshop | La page affiche le tableau de bord public (incidents OPEN/PENDING) **sans** bouton d'action |
| 1.2 | Vérifier l'absence de tout bouton « Prendre en charge », « Clore », etc. | Aucun bouton d'action visible |
| 1.3 | Vérifier les métriques (total, open, pending, en retard) | Chiffres cohérents avec la base |
| 1.4 | Filtrer par ligne (si filtre disponible en public) | Liste filtrée sans erreur |
| 1.5 | Appeler `/api/workshop/incidents` directement sans cookie | Retour `401 UNAUTHORIZED` |

---

## 2. Login / Logout admin

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 2.1 | Aller sur `/login` | Formulaire de connexion admin affiché |
| 2.2 | Soumettre des identifiants incorrects | Message d'erreur, aucun cookie posé |
| 2.3 | Soumettre les bons identifiants | Redirection vers `/` (tableau de bord admin), cookie `auth_token` posé |
| 2.4 | Rafraîchir la page | Toujours connecté (cookie valide) |
| 2.5 | Cliquer sur « Déconnexion » | Redirection vers `/login`, cookie supprimé |
| 2.6 | Accéder à `/` sans cookie | Redirection automatique vers `/login` |
| 2.7 | Appeler `/api/admin/auth/me` sans cookie | `401 UNAUTHORIZED` |

---

## 3. Login / Logout workshop

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 3.1 | Ouvrir `/workshop/login` | Formulaire badge affiché |
| 3.2 | Saisir un badge inexistant | Message d'erreur approprié |
| 3.3 | Saisir un badge sans mot de passe défini | Réponse `requiresPasswordSetup: true` → étape de création de mot de passe |
| 3.4 | Créer un nouveau mot de passe et valider | Connecté, cookie workshop posé |
| 3.5 | Se déconnecter | Cookie supprimé, retour sur `/workshop/login` |
| 3.6 | Se reconnecter avec le mot de passe créé | Connexion réussie |
| 3.7 | Saisir un mauvais mot de passe | `requiresPassword: true` + message d'erreur |
| 3.8 | Accéder à `/workshop/pilotage` sans cookie | Redirection vers `/workshop/login` |

---

## 4. Création de ligne

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 4.1 | En admin, aller sur « Lignes » | Liste des lignes existantes |
| 4.2 | Cliquer « Nouvelle ligne » | Modal de création ouvert |
| 4.3 | Laisser le numéro de ligne vide et valider | Erreur « Le numéro de ligne est obligatoire » |
| 4.4 | Entrer un numéro de ligne déjà existant | Erreur de conflit (LINE_ALREADY_EXISTS) |
| 4.5 | Ajouter une machine sans machineId → valider | Erreur « ID machine est obligatoire » |
| 4.6 | Ajouter deux machines avec le même ID → valider | Erreur de doublon |
| 4.7 | Remplir toutes les infos valides et valider | Ligne créée, apparaît dans la liste |
| 4.8 | Vérifier que la ligne est visible dans le board workshop | Ligne listée |

---

## 5. Édition machine

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 5.1 | Depuis la page Lignes, cliquer sur une ligne puis « Modifier » | Modal d'édition ouvert avec les données pré-remplies |
| 5.2 | Vider le champ machineId d'une machine et valider | Erreur de validation |
| 5.3 | Passer une machine en mode double robot | Les champs gauche/droite apparaissent, les anciens champs disparaissent |
| 5.4 | Remplir un double robot correctement et sauvegarder | Modification persistée |
| 5.5 | Modifier le numéro de robot d'une machine → sauvegarder | Mis à jour en base |
| 5.6 | Essayer de sauvegarder avec `robotHeads = 0` | Erreur « nombre de têtes doit être positif » |
| 5.7 | Annuler sans sauvegarder | Aucune modification persistée |

---

## 6. Cycle complet incident

> Pré-requis : être connecté en tant que **OPERATOR**, **MAINTENANCE**, et **RESPONSABLE** (3 sessions distinctes ou scénario séquentiel).

| # | Rôle | Action | Résultat attendu |
|---|------|--------|-----------------|
| 6.1 | OPERATOR | Créer un incident (shift, ligne, machine, robot, tête, état) | Incident OPEN créé, visible sur le board |
| 6.2 | RESPONSABLE | Vérifier la visibilité de l'incident | Incident présent avec les bons champs |
| 6.3 | MAINTENANCE | Prendre en charge | `is_taken = true`, statut reste OPEN |
| 6.4 | OPERATOR | Tenter de REQUEST_CANCEL sur un incident pris | **Interdit** (bouton absent ou erreur 403) |
| 6.5 | MAINTENANCE | Mettre en attente (SET_PENDING) | Statut passe à PENDING |
| 6.6 | MAINTENANCE | Reprendre (RESUME) | Statut repasse à OPEN |
| 6.7 | MAINTENANCE | Clore (CLOSE) avec note d'intervention | Statut CLOSED, `intervention_note` enregistrée |
| 6.8 | Tous | Vérifier l'incident dans l'historique | Incident visible dans `/workshop/history` |
| 6.9 | RESPONSABLE | Invalider un incident clôturé | Statut repasse à OPEN, événement INVALIDATE_CLOSED loggué |
| 6.10 | OPERATOR | Demander annulation (REQUEST_CANCEL) + motif | `cancel_request = true`, motif enregistré |
| 6.11 | RESPONSABLE | Approuver l'annulation | Incident CANCELED |
| 6.12 | Tous | Vérifier que l'incident annulé n'est plus sur le board actif | Absent du board |

---

## 7. Historique et connaissance

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 7.1 | Aller sur `/workshop/history` | Liste des incidents clôturés/annulés |
| 7.2 | Filtrer par ligne | Liste filtrée |
| 7.3 | Filtrer par état d'anomalie (DEGRADEE, etc.) | Liste filtrée |
| 7.4 | Rechercher un texte libre | Incidents contenant le terme affichés |
| 7.5 | Cliquer sur un incident historique | Détail complet (diagnostic, note, acteurs) |
| 7.6 | Aller sur `/workshop/knowledge` | Seuls les incidents CLOSED avec `intervention_note` non vide apparaissent |
| 7.7 | Vérifier qu'un incident annulé n'est pas dans la base de connaissance | Absent |
| 7.8 | Charger plus (pagination/limit) | Les incidents suivants s'affichent |
| 7.9 | Vérifier l'onglet événements d'un incident | Événements dans l'ordre chronologique (créé → pris → mis en attente → clôturé…) |

---

## Notes d'exécution

- Exécuter les tests sur un environnement **staging** ou **local avec Docker Compose**.
- Réinitialiser la base entre scénarios si nécessaire (`docker compose down -v && docker compose up`).
- Valider également sur **mobile / petit écran** les modals et le board.
