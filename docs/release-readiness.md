# Préparation de la release Sentinel v1.0.0

**Statut : NO-GO**

**Branche de stabilisation :** `release/v1.0.0-readiness`

**Baseline :** `182e7808c0fae1d57d290e10092fedc054736db1` (`main`, 19 juillet 2026)

Ce document est la source de pilotage de la stabilisation `v1.0.0`. Il relie
chaque constat connu à une décision, un lot, une preuve de correction et un état.
La [checklist de publication](release-checklist.md) reste la porte de sortie
opérationnelle ; le présent registre détermine si ses préconditions sont réunies.

## 1. Règles de pilotage

- gel fonctionnel : aucun nouveau besoin produit n'entre dans cette branche ;
- un lot ne mélange pas correction métier, refonte esthétique et maintenance sans
  rapport direct ;
- chaque correction est livrée avec ses tests comportementaux et sa documentation ;
- les migrations `001` à `045` sont immuables ; toute évolution commence à `046` ;
- un constat passe à `VERIFIED` seulement après revue du diff, tests requis et CI
  verte sur le commit qui le corrige ;
- un résultat local ne remplace pas une preuve PostgreSQL, navigateur ou VPS quand
  le contrat dépend de cet environnement ;
- aucun tag final ni capture de dossier n'est produit avant la fermeture des portes
  A, B et C ;
- l'historique Git existant n'est pas réécrit et aucun push forcé n'est autorisé ;
- la CI complète s'exécute à chaque push sur `release/**` et sur toute pull
  request visant `main` ;
- si `main` évolue, la branche intègre ces changements sans écraser le travail déjà
  publié et rejoue toutes les portes affectées.

### Niveaux

| Niveau | Signification | Règle de sortie |
| --- | --- | --- |
| `P0` | sécurité, intégrité métier, trace ou preuve de version fausse | bloque tout candidat |
| `P1` | contrat important, robustesse ou accessibilité attendue | bloque `v1.0.0` |
| `P2` | dette maîtrisée, qualité ou preuve complémentaire | doit être corrigé ou accepté explicitement |
| `EXT` | preuve ou décision dépendant d'un tiers/environnement | reste visible jusqu'à obtention |

### États

`OPEN` → `IN_PROGRESS` → `IMPLEMENTED` → `VERIFIED`.

`IMPLEMENTED` signifie que le code existe, pas que le constat est fermé.
`ACCEPTED` est réservé à une limite volontaire, documentée avec son périmètre et
sa condition de réouverture. `BLOCKED_EXTERNAL` ne vaut jamais validation.

## 2. Baseline factuelle

Les nombres ci-dessous décrivent le parent de la branche. Ils seront recalculés
depuis le candidat final et ne doivent pas être recopiés comme constantes dans le
dossier.

| Élément | Baseline vérifiée | Nature de la preuve |
| --- | ---: | --- |
| Fichiers suivis | 421 | `git ls-files` |
| Migrations SQL | 45 | `backend/migrations/*.sql` |
| Tables | 15 | 14 applicatives + `schema_migrations` |
| Tests unitaires backend | 354 | dernier audit/CI vert publié |
| Tests frontend | 346 | dernier audit/CI vert publié |
| Tests d'intégration PostgreSQL | 37 | dernier audit/CI vert publié |
| Parcours Playwright | 4 | dernier audit/CI vert publié |
| Total automatisé annoncé | 741 | somme des quatre niveaux précédents |
| Jobs CI | 5 | workflow `.github/workflows/ci.yml` |

La couverture publiée porte sur le périmètre critique configuré, pas sur tous les
fichiers de l'application. Toute communication au jury doit conserver cette
formulation.

### Instance publique au départ du chantier

La sonde HTTPS du 19 juillet 2026 répond `200` avec
`{"status":"ok","db":"ok"}`, sans propriété `version`, et expose encore
`X-Powered-By: Express`. Le code de la baseline prévoit au contraire
`health.version` et désactive cet en-tête. Le VPS n'est donc pas une preuve du
commit audité au démarrage de cette branche.

## 3. Décisions figées

| ID | Décision pour `v1.0.0` | Conséquence vérifiable |
| --- | --- | --- |
| `DR-01` | Un no-op n'est pas une mutation réussie. | Aucun `UPDATE`, aucun `updated_at`, aucun événement ; une demande opérateur identique renvoie `NO_CHANGES`. |
| `DR-02` | Un code de premier accès a exactement un consommateur. | Deux requêtes concurrentes produisent un succès unique et aucun second JWT valide. |
| `DR-03` | L'ordre global des verrous est ligne(s) par ID, utilisateur, incident. | Toute lecture préparatoire est revalidée après verrouillage ; les tests ne détectent aucun deadlock. |
| `DR-04` | Numéro et configuration d'une ligne sont gelés tant qu'elle porte un incident actif. | Renommage, retrait/reconfiguration de machine et désactivation répondent `409` ; les snapshots terminaux restent immuables. |
| `DR-05` | Une prise en charge revalide l'utilisateur dans sa transaction. | Un compte inactif, supprimé ou de rôle incompatible ne peut jamais devenir technicien affecté. |
| `DR-06` | Badge et numéro de ligne sont des chaînes composées de chiffres ; les zéros initiaux sont significatifs. | Formulaire, Zod et contraintes SQL partagent le même contrat ; les usernames admin ne peuvent pas être uniquement numériques. |
| `DR-07` | Badge ou rôle modifié révoque les sessions Atelier existantes. | `session_version` est incrémentée atomiquement lorsque l'autorité du token change. |
| `DR-08` | Dashboard, Historique, Connaissance et Pilotage sont lisibles par les trois rôles Atelier ; le Journal transverse reste Responsable. | Routes, navigation, API, cadrage et tests portent la même règle. |
| `DR-09` | Le Pilotage sépare les flux sur la période des cohortes créées sur la période. | Les libellés `créés`, `clôturés` et délais indiquent leur population ; aucune clôture hors fenêtre ne fuit dans un flux borné. |
| `DR-10` | La journée métier utilise `Europe/Paris`. | Bornes inclusives explicites, `start <= end`, fenêtre maximale de 366 jours et tests changement d'heure. |
| `DR-11` | Les listes historiques utilisent une pagination stable par curseur. | Historique, Connaissance, Journal et suivis résolus n'annoncent jamais une liste tronquée comme complète. |
| `DR-12` | Le Dashboard conserve la projection complète des incidents actifs. | Les suivis terminaux sont chargés séparément et paginés ; aucun incident actif n'est silencieusement masqué. |
| `DR-13` | L'outbox garantit une livraison au moins une fois, par destinataire. | Destinataires figés, reprise par lease, résultat explicite et absence de renvoi des destinataires déjà acceptés. |
| `DR-14` | SMTP désactivé ou sans destinataire n'est pas un succès d'envoi. | L'outbox conserve un état `SKIPPED_*` explicite et observable. |
| `DR-15` | Les cookies de session sont signés en plus du JWT et les réponses authentifiées ne sont pas mises en cache. | Écriture avec `signed: true`, lecture via `signedCookies`, test d'altération et `Cache-Control: no-store`. |
| `DR-16` | Les erreurs frontend dépendent des codes API, jamais du texte. | `SESSION_REVOKED` est partagé ; le seuil de réauthentification est cinq partout. |
| `DR-17` | Les secrets bcrypt sont bornés à 72 octets UTF-8. | Minimums : Atelier 10 caractères, Admin 12, Board 6 ; les nouveaux secrets hors bornes sont refusés. |
| `DR-18` | Le rate limiting mémoire est accepté uniquement pour une API mono-réplique. | La limite est documentée ; tout passage horizontal exige un stockage partagé avant déploiement. |
| `DR-19` | Une carte ou une ligne de tableau ne contient pas d'interactions imbriquées. | Éléments natifs, focus visible, cible `main-content` permanente et valeurs de graphiques accessibles. |
| `DR-20` | Backup et restauration utilisent un verrou commun et une intégrité obligatoire. | Checksum exigé, ledger validé, restauration jetable chronométrée et RTO consigné. |
| `DR-21` | Les faits du dossier sont générés depuis le candidat. | Aucun nombre durable n'est saisi en dur ; Markdown suivi comme source de vérité, sorties personnelles ignorées. |
| `DR-22` | Une release désigne un commit et des images immuables. | Tag, SHA de santé, labels OCI, digests déployés et recette désignent le même candidat. |

## 4. Registre des constats

### Intégrité et sécurité

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `SEC-01` | P0 | 1 | Code temporaire vérifié puis supprimé par opérations séparées. | Test PostgreSQL concurrent : un seul succès. | VERIFIED |
| `AUD-01` | P0 | 2 | Une édition directe identique écrit `INCIDENT_UPDATED` vide. | Test service + intégration sur le nombre d'événements. | VERIFIED |
| `AUD-02` | P0 | 2 | Une demande identique peut ouvrir un arbitrage. | Réponse `NO_CHANGES`, aucun cas ni événement créé. | VERIFIED |
| `CON-01` | P0 | 3 | Création validée avant transaction contre archivage/modification de ligne. | Test concurrent création/archivage et invariant final. | VERIFIED |
| `CON-02` | P0 | 3 | Validation ligne/machine d'une édition utilise le pool hors transaction. | Ligne verrouillée et sélection revalidée avec le même client. | VERIFIED |
| `CON-03` | P0 | 3 | Une ligne utilisée peut être renommée ou reconfigurée. | `409 RESOURCE_IN_USE` et tests de chaque champ structurel. | IMPLEMENTED |
| `CON-04` | P0 | 3 | Prise en charge concurrente avec désactivation/changement de rôle. | Test à deux transactions, aucun affecté invalide. | IMPLEMENTED |
| `AUTH-01` | P1 | 3 | Badge/rôle modifié sans incrément de `session_version`. | Ancien token refusé après chaque changement d'autorité. | IMPLEMENTED |

### Authentification et HTTP

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `HTTP-01` | P1 | 4 | `COOKIE_SECRET` requis mais cookies non signés. | Tests cookie valide, absent et altéré. | OPEN |
| `HTTP-02` | P1 | 4 | Absence de `no-store` global sur les API authentifiées. | Tests d'en-têtes sur Admin, Atelier et Board. | OPEN |
| `HTTP-03` | P1 | 4 | Réauthentification backend à cinq, frontend annoncé à trois et couplé au texte. | Code `SESSION_REVOKED` et parcours frontend dédié. | OPEN |
| `HTTP-04` | P1 | 4 | Un username admin peut masquer un badge Atelier identique. | Contrat de namespace et tests de création/login. | OPEN |
| `HTTP-05` | P1 | 4 | Identifiants numériques côté UI, chaînes libres côté API. | Validation partagée et migration avec préflight. | OPEN |
| `HTTP-06` | P1 | 4 | Timeout annulé avant lecture du corps HTTP. | Test d'un corps bloqué après réception des headers. | OPEN |
| `HTTP-07` | P1 | 4 | Maximum bcrypt exprimé en caractères au-delà de 72 octets. | Tests ASCII et multioctets aux frontières. | OPEN |
| `HTTP-08` | P2 | 4 | Politique Atelier/Board trop faible pour la cible annoncée. | Minimums `DR-17` documentés et testés. | OPEN |
| `HTTP-09` | P2 | 4 | `ErrorBoundary` affiche le message JavaScript brut. | Message générique en production, détail réservé au développement. | OPEN |
| `HTTP-10` | P2 | 4 | Rate limits en mémoire, non partageables entre répliques. | Limite mono-réplique documentée selon `DR-18`. | OPEN |

### Notifications

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `OUT-01` | P1 | 5 | Les leases `PROCESSING` périmés ne sont récupérés qu'au démarrage. | Test de récupération pendant le même processus. | OPEN |
| `OUT-02` | P1 | 5 | SMTP absent mène à `COMPLETED`. | État `SKIPPED_DISABLED` et métrique/log associés. | OPEN |
| `OUT-03` | P1 | 5 | Un échec partiel renvoie les destinataires déjà servis. | Reprise ciblée par destinataire. | OPEN |
| `OUT-04` | P1 | 5 | Plusieurs groupes déjà servis sont rejoués si le dernier échoue. | Livraisons indépendantes et idempotence testée. | OPEN |
| `OUT-05` | P1 | 5 | Destinataires/noms recalculés et préférence followers ambiguë. | Snapshot déterministe et préférence explicitement nommée. | OPEN |

### Pilotage et listes

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `ANA-01` | P1 | 6 | Rôles Pilotage contradictoires entre cadrage, routes et doctrine. | Contrat `DR-08` identique partout. | OPEN |
| `ANA-02` | P1 | 6 | Produits et synthèse textuelle promis sans contrat livré. | Fonction livrée et testée, ou promesse retirée. | OPEN |
| `ANA-03` | P1 | 6 | Journal annoncé filtrable par période sans bornes de date. | Contrôles et API de période cohérents. | OPEN |
| `ANA-04` | P1 | 6 | Cohorte de créations mélangée avec clôtures hors période. | Modèle flux/cohorte `DR-09` testé. | OPEN |
| `ANA-05` | P1 | 6 | Fenêtres invalides/non bornées et fuseau incohérent. | Validation backend et tests Europe/Paris. | OPEN |
| `ANA-06` | P2 | 6 | Tendance SQL effectue un produit jours × incidents. | Plan SQL borné et test volumétrique. | OPEN |
| `LIST-01` | P1 | 7 | Historique limité à 250 mais présenté comme complet. | Pagination stable et libellé exact. | OPEN |
| `LIST-02` | P1 | 7 | Connaissance limitée à 300 mais présentée comme complète. | Pagination stable et libellé exact. | OPEN |
| `LIST-03` | P1 | 7 | Journal limité à 80 sans navigation vers la suite. | Pagination conservant filtres et tri. | OPEN |
| `LIST-04` | P1 | 7 | Dashboard recharge actifs et suivis résolus sans borne séparée. | Projection active complète + suivis terminaux paginés. | OPEN |

### Accessibilité

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `A11Y-01` | P1 | 8 | `IncidentCard` imbrique un pseudo-bouton et de vrais boutons. | Arbre interactif valide et tests clavier. | OPEN |
| `A11Y-02` | P1 | 8 | Lignes utilisateurs/lignes en `tr role="button"`. | Action native dans une cellule, sémantique table conservée. | OPEN |
| `A11Y-03` | P1 | 8 | Filtre d'événement du Journal sans nom accessible. | Label associé vérifié par Testing Library/axe. | OPEN |
| `A11Y-04` | P1 | 8 | Certains états fiche utilisateur omettent `main-content`. | Skip link valide dans tous les états. | OPEN |
| `A11Y-05` | P1 | 8 | Valeurs du graphique disponibles seulement via `title`. | Alternative textuelle ou tableau accessible. | OPEN |
| `A11Y-06` | P1 | 8 | Règle label désactivée et aucune preuve axe/Lighthouse. | Règle active, axe critique vert et recette clavier consignée. | OPEN |

### Exploitation et preuves

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `OPS-01` | P1 | 9 | Restore n'acquiert pas le verrou utilisé par backup. | Test d'exclusion mutuelle. | OPEN |
| `OPS-02` | P1 | 9 | Restore accepte un dump sans checksum. | Refus par défaut, exception explicite auditée. | OPEN |
| `OPS-03` | P1 | 9 | Validation restore limitée à trois tables. | Ledger, checksums et données témoins contrôlés. | OPEN |
| `OPS-04` | EXT | 9 | Aucun exercice réel avec RTO et copie chiffrée prouvés. | Rapport daté sans données de production. | BLOCKED_EXTERNAL |
| `REL-01` | P0 | 12 | Aucun tag de release immuable. | Tag signé/protégé et release GitHub sur le SHA final. | OPEN |
| `REL-02` | P0 | 12 | VPS différent du candidat audité. | `/api/health.version` égale le SHA du tag. | OPEN |
| `REL-03` | P1 | 12 | Headers et anciens bundles attestent un déploiement antérieur. | Recette HTTPS et digests d'images consignés. | OPEN |
| `REL-04` | EXT | 12 | SMTP, navigateurs cibles et rollback non recettés sur le candidat. | Procès-verbal de recette daté. | BLOCKED_EXTERNAL |

### Tests, dépôt et dossier

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `TEST-01` | P1 | 10 | Couverture partielle parfois présentée sans son périmètre. | Rapports et dossier parlent de couverture ciblée. | OPEN |
| `TEST-02` | P1 | 10 | Contrôles de fiabilité surtout fondés sur des recherches de chaînes. | Contrats critiques couverts par comportement. | OPEN |
| `TEST-03` | P1 | 10 | E2E limités aux machines et arbitrages mobiles. | Auth, cycle complet, rôles, Board, Pilotage et Admin couverts. | OPEN |
| `TEST-04` | P1 | 10 | Courses, outbox, analytics, support et restauration absents de l'intégration réelle. | Suites PostgreSQL et exercices dédiés, isolés et répétables. | OPEN |
| `TEST-05` | P2 | 10 | Avertissements jsdom/React et absence de volumétrie. | Sorties propres et scénario de charge documenté. | OPEN |
| `DOC-01` | P0 | 11 | Dossier : 12 tables, 38 migrations, 579 tests, 4 jobs et 2 E2E. | Faits générés depuis le candidat final. | OPEN |
| `DOC-02` | P1 | 11 | `rebuildDossier.py` conserve des faits en dur. | Générateur sans nombres volatils codés en dur. | OPEN |
| `DOC-03` | P1 | 11 | Sources suivies avec marqueurs incomplets et anciens SHA. | Scan interdit sans résultat. | OPEN |
| `DOC-04` | P1 | 11 | Source/assets par défaut du générateur absents du dépôt. | Chaîne reproductible ou dépendances explicitement externes sans faux défaut. | OPEN |
| `DOC-05` | P0 | 11 | Calcul de Fermi et fourchette 200–290 non entièrement dérivés. | Formules, source et sensibilité recalculables. | OPEN |
| `DOC-06` | EXT | 11 | Volume du dossier dépend des consignes exactes du centre. | Corps/annexes mesurés contre la règle écrite. | BLOCKED_EXTERNAL |
| `GOV-01` | EXT | 11 | Usage de l'IA visible dans l'historique, règle du centre inconnue. | Position écrite, transparente et conforme. | BLOCKED_EXTERNAL |

## 5. Ordre d'exécution, lots et portes

Chaque lot part du dernier commit vert de cette branche. Il produit un commit
fonctionnel ciblé, ses tests et la mise à jour des constats concernés. La preuve
distante reste attachée au run GitHub Actions du commit et, lorsqu'elle existe,
à la pull request de stabilisation.

| Lot | Objectif borné | Constats principaux | Prérequis | État |
| ---: | --- | --- | --- | --- |
| `0` | Geler la baseline, les décisions, le registre et les portes qualité. | Gouvernance du chantier | Aucun | VERIFIED |
| `1` | Rendre le premier accès atomique. | `SEC-01` | Lot 0 | VERIFIED |
| `2` | Garantir qu'un no-op ne produit aucune trace ni arbitrage. | `AUD-01`, `AUD-02` | Lot 0 | VERIFIED |
| `3` | Aligner verrous, revalidations et invariants ligne/utilisateur/incident. | `CON-01` à `CON-04`, `AUTH-01` | Lots 1 et 2 | IMPLEMENTED |
| `4` | Unifier les contrats d'authentification et HTTP. | `HTTP-01` à `HTTP-10` | Lot 3 | OPEN |
| `5` | Rendre l'outbox observable et résistante aux reprises partielles. | `OUT-01` à `OUT-05` | Lots 3 et 4 | OPEN |
| `6` | Définir et fiabiliser périodes, rôles et KPI du Pilotage. | `ANA-01` à `ANA-06` | Lot 3 | OPEN |
| `7` | Paginer les listes sans perdre la projection opérationnelle active. | `LIST-01` à `LIST-04` | Lot 6 | OPEN |
| `8` | Corriger la sémantique et prouver les parcours accessibles. | `A11Y-01` à `A11Y-06` | Lots 4 et 7 | OPEN |
| `9` | Durcir et exercer sauvegarde/restauration. | `OPS-01` à `OPS-04` | Lot 3 | OPEN |
| `10` | Remplacer les preuves textuelles fragiles par des tests comportementaux. | `TEST-01` à `TEST-05` | Lots 1 à 9 | OPEN |
| `11` | Régénérer un dossier exact, reproductible et conforme. | `DOC-01` à `DOC-06`, `GOV-01` | Lots 1 à 10 | OPEN |
| `12` | Construire, déployer et recetter le candidat immuable. | `REL-01` à `REL-04` | Lots 1 à 11 | OPEN |

Le lot 3 est livré en sous-lots ordonnés afin que chaque invariant dispose de sa
preuve propre :

| Sous-lot | Périmètre | Constats | État |
| --- | --- | --- | --- |
| `3A` | Revalider l'utilisateur affecté, sérialiser son cycle de vie et révoquer les sessions après changement d'autorité. | `CON-04`, `AUTH-01` | IMPLEMENTED |
| `3B` | Verrouiller et revalider les lignes, puis geler leurs champs structurels tant qu'un incident actif les référence. | `CON-01`, `CON-02`, `CON-03` | IMPLEMENTED |

Preuves des lots clos :

- lot 0 : commit `064884da348db2c106791033e1fa6772e837cd90` et
  [run CI 242](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29687592997) ;
- lot 1 : commit `4e4acfc4f8e37586a1348b7be67f899404660af9` et
  [run CI 244](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29691306837) ;
- lot 2 : commit `091433fd36a866e2af0a108be4a33a9369f74ca3` et
  [run CI 246](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29692190921) ;
- lot 3B, verrouillage et revalidation : commit
  `51f53ebbefd7cf3b1d212c77fc13910e842615ea` et
  [run CI 248](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29694004289).

Les cinq jobs de chaque preuve sont verts.

### Porte A — intégrité métier

Lots `1`, `2` et `3`. Elle exige les tests de concurrence réels, zéro no-op
journalisé, une politique de verrouillage documentée et les invariants finaux
vérifiés en base.

### Porte B — robustesse plateforme

Lots `4` et `5`. Elle exige les contrats HTTP partagés, les sessions révocables,
des cookies altérés refusés et une outbox récupérable/testée avec panne partielle.

### Porte C — cohérence produit

Lots `6` à `10`. Elle exige les périodes et listes non ambiguës, les parcours
accessibles, la restauration démontrée et une couverture comportementale des
flux critiques.

### Porte D — certification

Lots `11` et `12`. Elle exige un dossier recalculé, une CI verte, un tag, des
images identifiées, un VPS au même SHA et une recette externe consignée.

## 6. Contrôles de chaque lot

Chaque lot exécute d'abord les tests ciblés, puis au minimum :

```bash
cd backend
npm run format:check
npm run lint
npm run typecheck:scripts
npm run build
npm test

cd ../frontend
npm run format:check
npm run lint
npm run build
npm test
```

Les lots SQL ajoutent `npm run test:integration` sur une base dédiée. Les lots
interface ajoutent les parcours Playwright concernés. Avant chaque porte, la
matrice CI complète de [release-checklist.md](release-checklist.md) est exigée.

## 7. Entrées externes à obtenir

- consignes écrites du centre : corps, annexes, impression et usage de l'IA ;
- définition mesurée des 35–40 événements, source du délai 3–4 jours et règle de
  conversion en stock simultané ;
- accès de déploiement, destinataire SMTP de recette et navigateurs/écran Board
  réellement présentés ;
- emplacement chiffré hors site et fenêtre autorisée pour l'exercice de
  restauration.

Ces entrées n'empêchent pas les lots techniques de commencer. Elles bloquent la
preuve finale correspondante.

## 8. Définition du GO

Le `GO v1.0.0` exige simultanément :

1. aucun constat `P0` ou `P1` dans un état autre que `VERIFIED` ;
2. tout `P2` vérifié ou accompagné d'une acceptation écrite et bornée ;
3. aucune contradiction, donnée volatile en dur ou marqueur de dossier incomplet ;
4. migrations validées depuis une base vide et depuis la baseline `045` ;
5. CI complète verte sur le SHA tagué ;
6. restauration, accessibilité critique et parcours multi-rôles prouvés ;
7. images déployées identifiées par digest et SHA ;
8. `/api/health.version` strictement égal au commit de la release ;
9. checklist et procès-verbal de recette rattachés au même candidat.

Tant que ces neuf conditions ne sont pas réunies, le statut reste `NO-GO`.
