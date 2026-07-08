# Analyse & plan d'application de la doctrine UX

Ce document confronte l'état actuel de l'interface à la [doctrine d'expérience](doctrine-ux.md),
écran par écran et de façon transversale, puis en déduit un plan d'action
priorisé. Les principes cités (P1–P7) renvoient à la doctrine.

Statut de l'existant : l'application est **fonctionnellement complète et
techniquement saine** (design tokens en place : couleurs, rayons, typo,
espacements, transitions). Le chantier qui suit ne corrige pas des bugs : il met
l'interface en **conformité avec la doctrine** pour passer de « cohérent » à
« intentionnel ».

---

## Partie A — Analyse

### A.0 Constats transversaux (macro)

Ces constats concernent toute l'application ; ils sont traités une fois, au niveau
système, plutôt que répétés écran par écran.

| # | Constat | Principe | Gravité |
|---|---------|----------|---------|
| T1 | **Pas de grammaire de couleur formalisée.** Les niveaux d'attention (calme / surveiller / traiter / critique) existent de façon dispersée (`--color-watch`, `pilotage-hero-stat-tension`, `board-incident-critical`, `badge-status priority`) mais sans tokens communs. Chaque écran réinvente sa sémantique. | P1, P4 | **Élevée** — c'est la fondation de tout le reste |
| T2 | **États de chargement incohérents.** Trois traitements coexistent : `Spinner`, texte « Chargement… », `FullPageLoader`. Aucun skeleton. Un spinner attire l'attention sur l'attente (anti-P2). | P2 | Moyenne |
| T3 | **Le temps n'est pas traité comme une matière (P7).** L'ancienneté existe (« depuis X », « > 7 j ») mais comme étiquette, pas comme modulation continue du niveau d'attention. Le « > 7 j » est un seuil brutal, pas une montée douce. | P7 | Moyenne |
| T4 | **La différenciation par rôle est partielle.** Le Dashboard distingue bien les rôles ; l'Historique, la Connaissance et le Pilotage ne le font pas (ou peu), alors que la matrice (§4 doctrine) prévoit des usages distincts. | P3 | Moyenne |
| T5 | **États vides traités inégalement.** Tantôt `EmptyState`, tantôt texte brut, tantôt rien. Le vide n'est pas conçu comme une information (P2, §5.4). | P2 | Faible |
| T6 | **Densité non pensée par contexte de lecture.** Le Board (lu de loin) et le Pilotage (lu de près) n'ont pas de règle de densité distincte explicite. | P2, §5.3 | Faible |

### A.1 Espace Atelier

#### Dashboard (`/workshop/dashboard`)
*Question (doctrine §4.1) : « où en est l'atelier, et qu'attend-il de moi maintenant ? »*

- **Forces.** Différenciation par rôle réelle (`isOperator/Maintenance/Responsable`).
  Structure lisible : métriques → recherche/tri → filtres → liste. La carte incident
  porte la bonne hiérarchie d'information (produit en premier).
- **Écarts.**
  - L'urgence repose encore sur un traitement visuel fort (`incident-card--urgent`)
    qui doit être revu selon P1 (émerger sans agresser) — c'est le déclencheur
    initial du chantier.
  - Le temps écoulé est affiché en date (`formatDateTime`) plutôt qu'en durée
    vécue (P7).
  - Le tri et les filtres sont les mêmes pour tous les rôles : un responsable et un
    opérateur n'ont pourtant pas la même question.
  - Texte d'aide au réordonnancement affiché en clair (à intégrer plus discrètement).

#### Board (`/board`)
*Question : « en un regard, sans interaction, où en est-on ? »*

- **Forces.** Vraie intention « grand écran » : grille, rotation de vues, niveaux
  `critical/watch/steady`, cartes de hauteur régulière. C'est l'écran le plus
  abouti structurellement.
- **Écarts.**
  - C'est l'application **la plus exigeante de P1** : à valider que le critique
    « émerge » sans saturer. La bordure rouge épaisse + chip peut être au-dessus du
    seuil d'agression.
  - P7 : l'ancienneté « > 7 j » est un chip binaire, pas une montée continue.
  - Densité (T6) : à confirmer que la carte n'a pas trop d'éléments pour une lecture
    à distance (5 blocs actuellement).

#### Pilotage (`/workshop/pilotage`)
*Question : « que révèle la durée — schémas, points chauds, progrès ? »*

- **Forces.** Hero + stats avec une amorce de niveaux d'attention
  (`hero-stat-watch/tension/critical`). Heatmap et graphiques présents.
- **Écarts.**
  - Aucune différenciation par rôle (T4) alors que maintenance et responsable n'y
    cherchent pas la même chose.
  - La sémantique de couleur des stats est locale (réinvente T1).
  - C'est l'écran « projection » (P7, Endsley) : il devrait davantage *éclairer
    l'avenir* (tendance, anticipation) que récapituler le présent.

#### Historique (`/workshop/history`)
*Question : « que s'est-il passé, et qui a contribué ? »*

- **Forces.** Sépare liste d'incidents et journal d'actions ; gestion mobile
  (cards) déjà présente.
- **Écarts.**
  - Aucune différenciation par rôle (T4).
  - **Risque P6** : l'affichage « qui a fait quoi » doit valoriser la contribution,
    pas exposer comme un tableau de surveillance. À auditer ton par ton.

#### Connaissance (`/workshop/knowledge`)
*Question : « ce problème, comment l'a-t-on résolu, et qu'en apprendre ? »*

- **Forces.** Affiche contexte + diagnostic + solution ; recherche présente.
- **Écarts (les plus stratégiques).**
  - C'est le **cœur de la valeur (P5)** mais conçu comme une *fiche de lecture*,
    pas comme un *dispositif d'apprentissage*. Rien n'oriente vers l'internalisation
    (réutiliser, comprendre le pourquoi, relier à des cas voisins).
  - Aucune différenciation par rôle (T4).
  - C'est l'écran avec le plus fort écart entre ambition (doctrine) et réalisation.

#### Assistance (`/workshop/support`)
- Chat IA. Cohérent et déjà nettoyé. Écarts mineurs (états, ton). Faible priorité.

### A.2 Espace Admin

L'admin n'est pas le cœur de la doctrine (orientée terrain/atelier), mais doit
rester cohérent.

- **Accueil** (`/admin/accueil`) : structure KPI saine (`KpiCard`). Le plus proche
  de la doctrine. Écart : « Points à vérifier » pourrait mieux orienter vers
  l'action (P3).
- **Utilisateurs / Lignes** : listes + tables classiques, fonctionnelles. Écarts :
  états vides/chargement (T2, T5), densité des tables sur mobile.
- **Audit** (`/admin/audit`) : journal admin. Même esprit que l'Historique (P6).
- **Support** : identique à l'assistance atelier.

### A.3 Portail & transverses

- **Portail** (`/login`) : 3 espaces (Board/Admin/Workshop). Vitrine soignée
  (déjà retravaillée). Faible priorité.
- **Board access, Login admin/atelier** : sobres, fonctionnels. RAS majeur.
- **Confidentialité, 404** : déjà traités. RAS.

### A.4 Composants partagés

- **`ui/` bien amorcé** : `EmptyState`, `KpiCard`, `Spinner`, `ErrorBanner`,
  `DetailField`, `CharCounter`, `SelectField`. Manque : un composant **Skeleton**
  (T2) et un composant **niveau d'attention / badge** unifié (T1).
- **Cartes** (`IncidentCard`, `BoardIncidentGrid`) : structure solide, à aligner
  sur la grammaire de couleur une fois T1 faite.
- **Modals** : nombreux mais homogènes (`Modal`, `TextConfirmModal`,
  `ConfirmModal`). Cohérents.
- **Navigation** : `ResponsiveNavBar` partagée, identique par rôle. Correct (la
  doctrine ne demande pas de nav par rôle).

---

## Partie B — Plan d'action (systémique, priorisé)

Principe directeur : **on traite d'abord les fondations transversales (qui font
tout découler), puis les écrans du plus stratégique au moins**. Chaque lot est
testable et déployable indépendamment.

### Phase 1 — Fondations (la grammaire avant les écrans)

> Sans cette phase, tout travail sur les écrans serait à refaire. C'est le socle.

1. **F1 — Grammaire de couleur (T1, P1/P4).** Créer les tokens de niveaux
   d'attention dans `:root` : `--attention-calm / -watch / -act / -critical`
   (fond, bordure, texte, accent). Définir la règle « le critique émerge par
   contraste relatif, pas par saturation ». Documenter dans la doctrine §5.1.
2. **F2 — Composant niveau d'attention (T1).** Un composant/utilitaire unique
   (badge, liseré, fond) qui applique la grammaire, pour que cartes, board, stats
   pilotage parlent le même langage.
3. **F3 — Le temps comme matière (T3, P7).** Une fonction unique « durée vécue +
   niveau d'attention dérivé de l'âge » réutilisable (Dashboard, Board, Pilotage).
   Remplacer le seuil binaire « > 7 j » par une montée continue.
4. **F4 — État de chargement unifié (T2, P2).** Introduire un `Skeleton`
   (placeholder de structure) et l'adopter là où c'est pertinent ; réserver le
   spinner aux actions ponctuelles. Supprimer les « Chargement… » textuels.

### Phase 2 — Le déclencheur : l'urgence (P1)

5. **U1 — Cartes urgence Dashboard.** Refaire `incident-card--urgent` selon F1 :
   l'urgent attire par contraste/position, sans agresser. C'est le cas qui a lancé
   le chantier ; il valide la grammaire F1 en conditions réelles.
6. **U2 — Cartes Board.** Aligner `board-incident-critical/watch/steady` sur F1 ;
   vérifier la lisibilité à distance (T6) et appliquer F3 (temps).

### Phase 3 — Le cœur de valeur : la Connaissance (P5)

7. **K1 — Repenser la fiche de connaissance** comme dispositif d'apprentissage.
   *Fait :* section « Déjà résolu ailleurs » reliant aux cas voisins (même
   machine ou même anomalie), calculés côté front sans nouvel endpoint. C'est la
   spirale : voir comment ce problème a été résolu ailleurs nourrit le modèle
   mental (P5).
8. **K2 — Mémoire collective rendue visible.** *Décision :* plutôt que de
   fragmenter l'écran par rôle (gold-plating — opérateur et maintenance y
   cherchent la même chose), on rend la richesse de la base visible à tous via un
   sous-titre valorisant (« N interventions sur M machines — la mémoire de
   l'atelier »). C'est l'application juste de P5 : donner le sentiment que la
   mémoire vit et grandit.

### Phase 4 — Cohérence des écrans secondaires

9. **S1 — Pilotage.** *Fait :* niveaux d'attention du hero (watch/tension)
   alignés sur la grammaire F1. L'écran sert déjà la projection (métriques
   agrégées, durées de résolution) ; pas de gold-plating ajouté.
10. **S2 — Historique & Audit.** *Vérifié conforme sur le ton* (P6, « Acteur »,
    « Cible », sans mise au pilori), *mais pas sur la structure* (P3) : l'écran
    Historique cumulait deux questions distinctes — le dossier d'un incident
    (« que s'est-il passé sur celui-ci ») et le journal transverse de l'atelier
    (« que s'est-il passé dans l'atelier »), sous forme d'un tableau
    « Journal global » dupliquant la Trace complète du dossier incident sur les
    mêmes données (`workshop_incident_events`). *Corrigé :* le journal
    transverse est extrait vers un écran dédié `/workshop/journal`, réservé au
    rôle Responsable (celui qui « oriente pour le collectif », doctrine §2),
    protégé aussi bien côté route front que côté service backend
    (`listHistoryEventsService`). Historique redevient : liste d'incidents +
    dossier, une seule question (§4.4). Les états de chargement restent traités
    globalement en Phase 5 (X1).
11. **S3 — Admin (Accueil/Users/Lines).** *Vérifié conforme :* l'accueil oriente
    déjà vers l'action (points qualité = boutons cliquables vers la correction,
    P3). Pas de changement forcé ; états de chargement → Phase 5.

### Phase 5 — Finitions transversales

12. **X1 — États de chargement.** *Fait :* skeletons (F4) sur les listes
    master-detail Connaissance et Historique, préservant la structure pendant le
    chargement. Les indicateurs inline (compteurs) et le `FullPageLoader`
    accessible restent légitimes.
13. **X2 — Densité par contexte.** *Vérifié conforme :* Board en densité minimale
    et gros repères (lecture de loin) ; Pilotage dense et analytique (lecture de
    près). Conforme à §5.3 sans changement à forcer.
14. **X3 — Passe finale de conformité.** *Fait + correction :* l'audit P1–P7 a
    relevé une vraie violation — les badges « demande en attente » pulsaient en
    boucle (`requestPulse`, interdit par P1/§5.2). Remplacés par un traitement
    statique aligné sur la grammaire d'attention. Seules subsistent les animations
    légitimes (spinner, skeleton, indicateur « écrit… » du chat).

---

## Méthode de travail

- **Un lot = un commit testé, déployable.** On valide visuellement (toi) avant le
  lot suivant.
- **Chaque changement est justifié par un principe** (référence Pn dans le commit).
- **On ne touche pas au backend** : il est sain et la doctrine est une couche
  d'expérience.
- **Ordre non négociable** : Phase 1 (fondations) avant tout le reste, sinon on
  refait deux fois.

## Tableau de bord du chantier

| Phase | Lot | Principe | État |
|-------|-----|----------|------|
| 1 | F1 Grammaire couleur | P1, P4 | ✅ Fait |
| 1 | F2 Composant attention | P1, P4 | ✅ Fait |
| 1 | F3 Temps matière | P7 | ✅ Fait |
| 1 | F4 Chargement unifié | P2 | ✅ Fait |
| 2 | U1 Urgence Dashboard | P1 | ✅ Fait |
| 2 | U2 Cartes Board | P1, P7 | ✅ Fait |
| 3 | K1 Fiche connaissance (cas similaires) | P5 | ✅ Fait |
| 3 | K2 Mémoire collective rendue visible | P5 | ✅ Fait |
| 4 | S1 Pilotage | P1, P3, P7 | ✅ Fait (grammaire alignée) |
| 4 | S2 Historique & Audit | P3, P6 | ✅ Fait (journal extrait vers `/workshop/journal`) |
| 4 | S3 Admin | P2, P3 | ✅ Vérifié conforme |
| 5 | X1 États de chargement (skeletons) | P2 | ✅ Fait |
| 5 | X2 Densité par contexte | P2 | ✅ Vérifié conforme |
| 5 | X3 Passe conformité (corrige pulsation) | P1–P7 | ✅ Fait |
