# Recette manuelle Sentinel

Cette recette complète les tests automatisés. Elle s'exécute sur une base dédiée,
jamais sur les données de production. Consigner date, SHA, navigateur, viewport et
résultat de chaque scénario.

## 1. Préparation

- [ ] CI verte sur le SHA testé
- [ ] environnement local/staging sain via `/api/health`
- [ ] un admin, un opérateur, une maintenance et un responsable disponibles
- [ ] une ligne active avec machine simple et une avec double robot
- [ ] DevTools sans erreur console au chargement initial
- [ ] navigateur desktop et viewport mobile 393 x 851 préparés

Pour une recette automatisable et jetable, utiliser `backend/scripts/seedE2E.ts`.
Ne jamais réinitialiser un environnement partagé avec `docker compose down -v`.

## 2. Portail et sessions

| # | Action | Résultat attendu |
| --- | --- | --- |
| 2.1 | Ouvrir `/login` | trois entrées Board, Administration, Atelier |
| 2.2 | Choisir Administration | `/admin/login`, focus dans le formulaire |
| 2.3 | Identifiants admin faux | erreur générique, aucun accès |
| 2.4 | Connexion admin valide | `/admin/accueil`, session persistante au refresh |
| 2.5 | Déconnexion admin | retour portail, route admin ensuite refusée |
| 2.6 | Choisir Atelier | `/workshop/login` |
| 2.7 | Badge inexistant / mot de passe faux | erreur sans révéler le compte |
| 2.8 | Compte à initialiser | code temporaire puis choix d'un mot de passe |
| 2.9 | Rejouer le code temporaire | refus |
| 2.10 | Connexion Atelier valide | dashboard et rôle corrects |
| 2.11 | Déconnexion Atelier | cookie supprimé, route workshop refusée |
| 2.12 | Saisir un badge avec lettres | validation locale et aucun appel de connexion |

Vérifier dans DevTools que les cookies de production sont `HttpOnly`, `Secure` et
`SameSite=Strict`.

## 3. Isolation des audiences

- [ ] avec uniquement une session Atelier, `/api/admin/dashboard` répond 401
- [ ] cette même session Atelier peut lire la projection Board, sans action métier
- [ ] avec uniquement une session Admin, `/api/workshop/incidents` répond 401
- [ ] avec uniquement une session Board, les API Admin/Atelier répondent 401
- [ ] `/api/board/data` sans session Board ni Atelier répond 401
- [ ] une désactivation Atelier invalide sa session existante
- [ ] une rotation du mot de passe invalide les anciennes sessions
- [ ] un changement de rôle est visible au prochain appel protégé

## 4. Administration des comptes

| # | Action | Résultat attendu |
| --- | --- | --- |
| 4.1 | Créer un compte valide | fiche créée, code setup affiché une fois |
| 4.2 | Badge non numérique | validation frontend et API, aucune écriture |
| 4.3 | Modifier sans changer de valeur | aucun faux événement d'audit |
| 4.4 | Changer nom, e-mail et rôle | valeurs et audit cohérents |
| 4.5 | Réinitialiser le mot de passe | nouveau code, ancienne session invalidée |
| 4.6 | Désactiver sans incident affecté | compte refusé au login |
| 4.7 | Réactiver | connexion possible avec setup/secret attendu |
| 4.8 | Désactiver un technicien affecté | opération bloquée avec impact |
| 4.9 | Archiver un compte admissible | données anonymisées, historique lisible |
| 4.10 | Quatre réauthentifications Admin fausses | action refusée, session conservée |
| 4.11 | Cinquième réauthentification Admin fausse | session révoquée, cookie effacé, retour au login |
| 4.12 | Badge `0012` puis badge `12` | deux identifiants distincts acceptés |

## 5. Lignes et machines

| # | Action | Résultat attendu |
| --- | --- | --- |
| 5.1 | Créer une ligne + machine simple | ligne visible et sélectionnable Atelier |
| 5.2 | Numéro de ligne non numérique | validation frontend et API, aucune écriture |
| 5.3 | ID machine doublon sur autre ligne | conflit global |
| 5.4 | Machine sans marque/ID ou tête à 0 | validation avant écriture |
| 5.5 | Passer simple vers double robot | champs cohérents, sauvegarde persistée |
| 5.6 | Revenir double vers simple | anciens champs non réutilisés |
| 5.7 | Fermer une modale sale | confirmation séparée, Annuler conserve le formulaire |
| 5.8 | Sauvegarder deux fois rapidement | une seule mutation |
| 5.9 | Désactiver une ligne avec incident actif | blocage et impact exact |
| 5.10 | Archiver une ligne admissible | disparition du référentiel actif, audit conservé |
| 5.11 | Ligne `0012` puis ligne `12` | deux numéros distincts acceptés |

## 6. Cycle incident

Utiliser des sessions distinctes ou se reconnecter entre rôles.

| # | Rôle | Action | Résultat attendu |
| --- | --- | --- | --- |
| 6.1 | Opérateur | créer un incident complet | `OPEN`, non pris, événement créé |
| 6.2 | Opérateur | recréer le même emplacement | conflit, aucun doublon |
| 6.3 | Maintenance | prendre en charge | affectation et date renseignées |
| 6.4 | Même maintenance | reprendre immédiatement | action absente/refusée, aucun no-op |
| 6.5 | Autre maintenance | utiliser TAKE | transfert tracé |
| 6.6 | Maintenance | mettre en attente sans diagnostic | refus |
| 6.7 | Maintenance | mettre en attente avec diagnostic | `PENDING` |
| 6.8 | Maintenance | clôturer depuis `PENDING` | refus |
| 6.9 | Maintenance | reprendre puis clôturer avec note | `CLOSED` |
| 6.10 | Responsable | invalider sans motif puis avec motif | refus puis `INVALIDATED` |
| 6.11 | Tous | consulter historique | acteurs, snapshots et ordre cohérents |

## 7. Arbitrage d'annulation

Créer une déclaration opérateur non prise puis demander son annulation avec motif.

### Cas actif

- [ ] tuile Responsable « À arbitrer » incrémentée
- [ ] pastille rouge incrémentée pour le nouveau cas `ACTIVE`
- [ ] clic incident ouvre une seule modale d'arbitrage
- [ ] contexte suffisant pour décider sans ouvrir le dossier
- [ ] fond sous-jacent flouté sans voile noir opaque
- [ ] body non scrollable, Tab contenu dans la modale, Escape ferme la couche

### Reporter

- [ ] Reporter ferme la modale et ouvre le dossier
- [ ] dossier mobile positionné à son début
- [ ] cas et pastille restent actifs/non lus
- [ ] fermer puis rouvrir l'incident fait réapparaître la modale

### Consulter

- [ ] Consulter le dossier ouvre le dossier et marque `CONSULTED`
- [ ] compteur total « À arbitrer » conserve le cas ouvert
- [ ] pastille de nouveaux cas diminue
- [ ] ouvrir le dossier par un autre chemin ne change jamais l'état du cas

### Décision

- [ ] Refuser garde l'incident actif et clôt le cas `REJECTED`
- [ ] sur une nouvelle demande, Annuler l'incident passe `CANCELED` et le cas
      `APPROVED`
- [ ] double clic ne crée qu'une décision et qu'une trace

## 8. Arbitrage de correction

Créer une demande qui modifie plusieurs champs.

- [ ] valeurs Actuel/Demandé exactes et texte long sans rupture de mot isolée
- [ ] incident inchangé avant décision
- [ ] Reporter et Consulter suivent exactement les règles de la section 7
- [ ] Refuser conserve les valeurs actuelles
- [ ] Appliquer modifie seulement les champs demandés
- [ ] retrait opérateur clôt le cas `WITHDRAWN`
- [ ] aucun arbitrage ouvert concurrent sur le même incident

## 9. Dashboard et responsive

### Desktop 1920 x 1080

- [ ] zone haute alignée et stable lors de l'ouverture d'un dossier
- [ ] liste et panneau restent dans la même largeur de contenu
- [ ] panneau centré verticalement dans la zone utile lorsque possible
- [ ] scroll du panneau fonctionne sans focus préalable
- [ ] molette au-dessus de la liste fait défiler la liste/page attendue
- [ ] aucune double scrollbar incohérente
- [ ] navigation incident précédent/suivant conserve un contexte lisible

### Mobile 393 x 851

- [ ] tuiles ordonnées selon le rôle et sans overflow horizontal
- [ ] dossier ouvert placé à son en-tête, pas au milieu de son contenu
- [ ] fermeture restaure une position utile dans la liste
- [ ] modales d'arbitrage entièrement visibles sans scroll interne
- [ ] boutons d'action entre 32 et 52 px de haut, libellés complets
- [ ] menu, clavier virtuel et rotation portrait/paysage restent utilisables

## 10. Vues transverses

- [ ] Board : code requis hors session Atelier, lecture seule, rotation et préférences par écran
- [ ] Board : aucune action métier ni appel API Atelier détaillé
- [ ] Historique : filtres, URL incident et trace complète
- [ ] Journal Responsable : filtres et navigation vers le dossier
- [ ] Pilotage : période, ligne, machine, KPI, tendances et classements
- [ ] Connaissance : seulement `CLOSED` avec intervention exploitable
- [ ] navigation croisée Historique/Connaissance conserve l'incident ciblé
- [ ] Support sans clé IA : message gracieux, reste de l'application intact

## 11. Dégradation et accessibilité

- [ ] couper le backend pendant un chargement : erreur claire, pas d'écran blanc
- [ ] ralentir le réseau : loading stable, aucune ancienne réponse ne remplace la nouvelle
- [ ] double soumission : une seule requête
- [ ] navigation uniquement clavier sur les parcours critiques
- [ ] zoom 200 % sans perte d'information/action
- [ ] `prefers-reduced-motion` supprime les animations non essentielles
- [ ] lecteur d'écran : titres, erreurs, compteurs et modales annoncés utilement

## 12. Clôture de recette

- [ ] données de test supprimées chirurgicalement ou environnement jeté
- [ ] aucun volume partagé/production supprimé
- [ ] captures et logs ne contiennent aucun secret
- [ ] anomalies enregistrées avec étapes, attendu, obtenu, viewport et SHA
- [ ] résultat rattaché à la checklist de publication
