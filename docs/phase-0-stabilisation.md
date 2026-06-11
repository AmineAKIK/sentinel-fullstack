# Phase 0 - Stabilisation

Cette phase sert de base de contrôle avant les refactors de séparation des responsabilités et les refactors DRY.

## État Technique De Référence

- Branche de travail : `refactor/phase-0-stabilisation`
- Frontend : `npm run build` OK
- Backend : `npm run build` OK
- DRY baseline : backend `npm run build` OK
- DRY baseline : frontend `npm run build` OK
- DRY baseline : `npm run verify:reliability` échoue encore sur 7 points connus, à traiter hors phase DRY mécanique.
- Les dossiers `node_modules/`, `dist/` et les fichiers `.env` doivent rester ignorés par git.
- Les exemples d'environnement doivent être versionnés :
  - `backend/.env.example`
  - `frontend/.env.example`

## Dette Active Avant Refactor DRY

Ces points sont connus au moment du lancement du chantier DRY. Ils ne doivent pas être confondus avec des régressions introduites par les extractions mécaniques.

- `verify:reliability` : Admin cannot remove active operational references.
- `verify:reliability` : Workshop permissions are mirrored backend/frontend.
- `verify:reliability` : Canceled incidents are preserved but excluded from operational metrics.
- `verify:reliability` : Board respects responsible manual ordering after priority.
- `verify:reliability` : Workshop history, pilotage, and knowledge are separated pages.
- `verify:reliability` : Workshop pilotage exposes period trend indicators.
- `verify:reliability` : Workshop event log has payloads for important operational decisions.

## Périmètre Source À Surveiller

Les prochaines phases DRY doivent rester centrées sur ces zones, sans nettoyage destructif global.

- Backend contrôleurs : helpers d'erreur, validation Zod, parsing d'identifiants.
- Backend services : `ServiceResult`, erreurs métier, retours homogènes.
- Backend repositories : constantes de statuts, fragments SQL simples, pagination.
- Backend auth : cookies, JWT, réponses de session.
- Frontend utils : dates, query params, labels, permissions.
- Frontend composants : modales, loaders, champs détail, cartes KPI, états vides.
- Frontend workshop : filtres ligne/machine, sélection incident par URL, pages historique/pilotage/connaissance.

## Garde-Fous DRY

- Ne pas extraire une abstraction tant qu'elle ne remplace pas au moins deux usages réels.
- Garder les changements mécaniques séparés des changements métier.
- Après chaque phase : lancer `npm run build` dans `backend/` et `frontend/`.
- Si une phase touche aux permissions ou aux statuts, relancer aussi `npm run verify:reliability`.
- Ne pas modifier les payloads API dans les phases de pur DRY.
- Ne pas déplacer une règle métier frontend/backend sans identifier la source de vérité.
- Ne pas corriger les fichiers générés `dist/` dans une phase source, sauf décision explicite.
- Ne pas restaurer ou supprimer `.env`, `node_modules/` ou `dist/` sans validation dédiée.

## Checklist Manuelle Critique

Valider ces parcours avant chaque grande phase de refactor.

### Accès Et Sessions

- Portail : ouvrir `/login`, puis choisir Administration.
- Admin : se connecter avec les identifiants de dev.
- Admin : vérifier `/admin/accueil`.
- Admin : se déconnecter.
- Atelier : ouvrir `/login`, puis choisir Workshop.
- Atelier : connexion badge sans mot de passe si applicable.
- Atelier : connexion badge + mot de passe si applicable.
- Atelier : redirection vers `/workshop/dashboard`.
- Atelier : déconnexion depuis la navigation.
- Board : ouvrir `/board`.
- Board : verifier que le code board est demande avant affichage.

### Administration Utilisateurs

- Lister les utilisateurs.
- Filtrer par rôle.
- Trier alphabétiquement et par date.
- Créer un utilisateur.
- Modifier nom, prénom, badge, rôle et statut.
- Réinitialiser le mot de passe.
- Désactiver puis réactiver un utilisateur.
- Tenter une suppression avec mot de passe admin invalide.
- Supprimer logiquement un utilisateur sans incident actif bloquant.
- Vérifier que l'audit admin reçoit les événements attendus.

### Administration Lignes

- Lister les lignes.
- Créer une ligne avec machines.
- Détecter un numéro de ligne déjà utilisé.
- Détecter un conflit d'ID machine.
- Modifier le résumé d'une ligne.
- Modifier une machine.
- Réordonner le plan de ligne si disponible.
- Désactiver puis réactiver une ligne.
- Tenter une suppression avec incidents actifs.
- Supprimer logiquement une ligne sans incident actif bloquant.
- Vérifier que l'audit ligne reçoit les événements attendus.

### Atelier - Incidents

- Créer un incident opérateur.
- Vérifier l'affichage dans le dashboard atelier.
- Modifier un incident avant prise en charge selon le rôle.
- Demander une correction côté opérateur.
- Approuver une correction côté responsable.
- Refuser une correction côté responsable.
- Demander une annulation côté opérateur.
- Approuver une annulation côté responsable.
- Refuser une annulation côté responsable.
- Prendre en charge côté maintenance.
- Passer en attente avec diagnostic.
- Reprendre un incident en attente.
- Clôturer avec note d'intervention.
- Invalider un incident clôturé côté responsable.
- Marquer ou retirer l'urgence côté responsable.
- Modifier le commentaire responsable.
- Réordonner les incidents prioritaires si disponible.

### Atelier - Vues Transverses

- Board : vérifier métriques, rotation, pages et paramètres par écran.
- Board : vérifier le mode sans session atelier.
- Historique : filtrer par texte, statut, ligne, machine, anomalie et type d'événement.
- Historique : ouvrir un incident depuis un événement.
- Pilotage : changer période, ligne et machine.
- Pilotage : vérifier KPI, tendances et classements.
- Connaissance : lister les incidents clôturés avec note.
- Connaissance : ouvrir une fiche connaissance.

## Règles De Refactor À Respecter

- Ne pas changer les routes publiques pendant les phases de séparation.
- Ne pas changer les payloads API sans phase dédiée DTO/contrats.
- Garder le backend source de vérité pour les permissions.
- Garder un build frontend et backend vert après chaque extraction.
- Préférer des extractions mécaniques et petites : policy, events, repository, service.
- Ne pas mélanger refactor architectural et changement métier dans le même diff.
