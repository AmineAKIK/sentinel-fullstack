# Préparation de la release Sentinel v1.0.0

**Statut historique du registre initial : NO-GO**

**Branche historique de stabilisation :** `release/v1.0.0-readiness`

**Baseline historique :** `182e7808c0fae1d57d290e10092fedc054736db1`
(`main`, 19 juillet 2026)

Ce document est la source de pilotage de la stabilisation `v1.0.0`. Il relie
chaque constat connu à une décision, un lot, une preuve de correction et un état.
La [checklist de publication](release-checklist.md) reste la porte de sortie
opérationnelle ; le présent registre détermine si ses préconditions sont réunies.

### Mise à jour documentaire RC5

**Statut RC5 : BLOCKED_EXTERNAL.** Les six constats terminaux
`RC5-AUD-01..06` sont désormais corrigés avec tests permanents rouges→verts et
risque résiduel local `NONE`. Le registre terminal couvre
[`577/577`](rc5-final-audit-register.tsv) chemins.

Les preuves terminales sont : backend `626/626`, PostgreSQL `165/165` hérité
par identité de sous-arbre, frontend `787/787`, ciblés frontend `74/74`,
backend configuration/CSRF `146/146`, concurrence Journal cinq passages
consécutifs et E2E des six constats `6/6 ×3`. Chromium complet est vert
`161/161` sur base fraîche avec axe. Le préflight reconstruit les images
locales et passe `26/26`. Les audits réels et la garde de politique `15/15`
ne reconnaissent que les deux exceptions documentées.

Les deux advisories Router et Brace restent des faits upstream, mais sont
bornés par la politique expirant le 31 août 2026 et ne constituent pas un
défaut local ouvert tant que la garde reste verte. Router `7.18.2` est utilisé
en mode déclaratif React 18 sans RSC; Brace reste limité aux chaînes de
développement et absent du runtime.

Les protections GitHub déjà appliquées restent celles documentées dans
[rc5-decision-dossiers.md](rc5-decision-dossiers.md) : Actions limitées,
SHA complets, ruleset `main` avec six checks, tags `v*` verrouillés et releases
immuables. Aucune opération distante supplémentaire n'a été faite pendant la
correction terminale.

Le seul blocage de release restant est externe : absence d'un reviewer
indépendant et d'une identité technique dédiée aux tags. Cette décision
organisationnelle ne peut pas être résolue localement avec l'unique
administrateur actuel; aucun compte, reviewer, environnement ou identité
fictive n'a été créé.

La lecture publique non mutative antérieure reste un fait historique sur RC4,
pas une preuve de déploiement RC5. La CI distante, la publication et la recette
restent soumises à des autorisations séparées.

## 1. Règles de pilotage

- gel fonctionnel : aucun nouveau besoin produit n'entre dans cette branche ;
- un lot ne mélange pas correction métier, refonte esthétique et maintenance sans
  rapport direct ;
- chaque correction est livrée avec ses tests comportementaux et sa documentation ;
- les migrations publiées `001` à `050` sont immuables ; RC5 n'ajoute aucune
  migration `051` ;
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
| `DR-23` | `notif_operateurs` reste une préférence groupée couvrant followers, déclarant et opérateurs ; aucune préférence `notif_followers` dédiée n'est introduite par ce chantier. | Décision produit préexistante au lot 5, hors périmètre robustesse ; réouvrable si un besoin business explicite de désolidariser ces audiences apparaît. |
| `DR-24` | Le module support (chat IA DeepSeek) n'a pas de suite d'intégration PostgreSQL dédiée : c'est un proxy HTTP stateless, sans donnée persistée à vérifier après coup. | Sa seule dépendance DB réelle (revalidation d'auth dans `adminAuthMiddleware`/`workshopAuthMiddleware`) est déjà couverte par `auth.integration.test.ts` ; réouvrable si le module gagne un jour une persistance de conversation. |

## 4. Registre des constats

### Intégrité et sécurité

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `SEC-01` | P0 | 1 | Code temporaire vérifié puis supprimé par opérations séparées. | Test PostgreSQL concurrent : un seul succès. | VERIFIED |
| `AUD-01` | P0 | 2 | Une édition directe identique écrit `INCIDENT_UPDATED` vide. | Test service + intégration sur le nombre d'événements. | VERIFIED |
| `AUD-02` | P0 | 2 | Une demande identique peut ouvrir un arbitrage. | Réponse `NO_CHANGES`, aucun cas ni événement créé. | VERIFIED |
| `CON-01` | P0 | 3 | Création validée avant transaction contre archivage/modification de ligne. | Test concurrent création/archivage et invariant final. | VERIFIED |
| `CON-02` | P0 | 3 | Validation ligne/machine d'une édition utilise le pool hors transaction. | Ligne verrouillée et sélection revalidée avec le même client. | VERIFIED |
| `CON-03` | P0 | 3 | Une ligne utilisée peut être renommée ou reconfigurée. | `409 RESOURCE_IN_USE` et tests de chaque champ structurel. | VERIFIED |
| `CON-04` | P0 | 3 | Prise en charge concurrente avec désactivation/changement de rôle. | Test à deux transactions, aucun affecté invalide. | VERIFIED |
| `AUTH-01` | P1 | 3 | Badge/rôle modifié sans incrément de `session_version`. | Ancien token refusé après chaque changement d'autorité. | VERIFIED |

### Authentification et HTTP

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `HTTP-01` | P1 | 4 | `COOKIE_SECRET` requis mais cookies non signés. | Tests cookie valide, absent et altéré. | VERIFIED |
| `HTTP-02` | P1 | 4 | Absence de `no-store` global sur les API authentifiées. | Tests d'en-têtes sur Admin, Atelier et Board. | VERIFIED |
| `HTTP-03` | P1 | 4 | Réauthentification backend à cinq, frontend annoncé à trois et couplé au texte. | Code `SESSION_REVOKED` et parcours frontend dédié. | VERIFIED |
| `HTTP-04` | P1 | 4 | Un username admin peut masquer un badge Atelier identique. | Contrat de namespace et tests de création/login. | VERIFIED |
| `HTTP-05` | P1 | 4 | Identifiants numériques côté UI, chaînes libres côté API. | Validation partagée et migration avec préflight. | VERIFIED |
| `HTTP-06` | P1 | 4 | Timeout annulé avant lecture du corps HTTP. | Test d'un corps bloqué après réception des headers. | VERIFIED |
| `HTTP-07` | P1 | 4 | Maximum bcrypt exprimé en caractères au-delà de 72 octets. | Tests ASCII et multioctets aux frontières. | VERIFIED |
| `HTTP-08` | P2 | 4 | Politique Atelier/Board trop faible pour la cible annoncée. | Minimums `DR-17` documentés et testés. | VERIFIED |
| `HTTP-09` | P2 | 4 | `ErrorBoundary` affiche le message JavaScript brut. | Message générique en production, détail réservé au développement. | VERIFIED |
| `HTTP-10` | P2 | 4 | Rate limits en mémoire, non partageables entre répliques. | Limite mono-réplique documentée selon `DR-18`. | VERIFIED |

### Notifications

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `OUT-01` | P1 | 5 | Les leases `PROCESSING` périmés ne sont récupérés qu'au démarrage. | Test de récupération pendant le même processus. | VERIFIED |
| `OUT-02` | P1 | 5 | SMTP absent mène à `COMPLETED`. | État `SKIPPED_DISABLED` et métrique/log associés. | VERIFIED |
| `OUT-03` | P1 | 5 | Un échec partiel renvoie les destinataires déjà servis. | Reprise ciblée par destinataire. | VERIFIED |
| `OUT-04` | P1 | 5 | Plusieurs groupes déjà servis sont rejoués si le dernier échoue. | Livraisons indépendantes et idempotence testée. | VERIFIED |
| `OUT-05` | P1 | 5 | Destinataires/noms recalculés et préférence followers ambiguë. | Snapshot déterministe par canal (`delivered_recipients`) ; nommage de préférence groupée accepté selon `DR-23`. | VERIFIED |

### Pilotage et listes

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `ANA-01` | P1 | 6 | Rôles Pilotage contradictoires entre cadrage, routes et doctrine. | Contrat `DR-08` identique partout. | VERIFIED |
| `ANA-02` | P1 | 6 | Produits et synthèse textuelle promis sans contrat livré. | Fonction livrée et testée, ou promesse retirée. | VERIFIED |
| `ANA-03` | P1 | 6 | Journal annoncé filtrable par période sans bornes de date. | Contrôles et API de période cohérents. | VERIFIED |
| `ANA-04` | P1 | 6 | Cohorte de créations mélangée avec clôtures hors période. | Modèle flux/cohorte `DR-09` testé. | VERIFIED |
| `ANA-05` | P1 | 6 | Fenêtres invalides/non bornées et fuseau incohérent. | Validation backend et tests Europe/Paris. | VERIFIED |
| `ANA-06` | P2 | 6 | Tendance SQL effectue un produit jours × incidents. | Plan SQL borné et test volumétrique. | VERIFIED |
| `LIST-01` | P1 | 7 | Historique limité à 250 mais présenté comme complet. | Pagination stable et libellé exact. | VERIFIED |
| `LIST-02` | P1 | 7 | Connaissance limitée à 300 mais présentée comme complète. | Pagination stable et libellé exact. | VERIFIED |
| `LIST-03` | P1 | 7 | Journal limité à 80 sans navigation vers la suite. | Pagination conservant filtres et tri. | VERIFIED |
| `LIST-04` | P1 | 7 | Dashboard recharge actifs et suivis résolus sans borne séparée. | Projection active complète + suivis terminaux paginés. | VERIFIED |

### Accessibilité

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `A11Y-01` | P1 | 8 | `IncidentCard` imbrique un pseudo-bouton et de vrais boutons. | Arbre interactif valide et tests clavier. | VERIFIED |
| `A11Y-02` | P1 | 8 | Lignes utilisateurs/lignes en `tr role="button"`. | Action native dans une cellule, sémantique table conservée. | VERIFIED |
| `A11Y-03` | P1 | 8 | Filtre d'événement du Journal sans nom accessible. | Label associé vérifié par Testing Library/axe. | VERIFIED |
| `A11Y-04` | P1 | 8 | Certains états fiche utilisateur omettent `main-content`. | Skip link valide dans tous les états. | VERIFIED |
| `A11Y-05` | P1 | 8 | Valeurs du graphique disponibles seulement via `title`. | Alternative textuelle ou tableau accessible. | VERIFIED |
| `A11Y-06` | P1 | 8 | Règle label désactivée et aucune preuve axe/Lighthouse. | Règle active, axe critique vert et recette clavier consignée. | VERIFIED |

### Exploitation et preuves

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `OPS-01` | P1 | 9 | Restore n'acquiert pas le verrou utilisé par backup. | Test d'exclusion mutuelle. | VERIFIED |
| `OPS-02` | P1 | 9 | Restore accepte un dump sans checksum. | Refus par défaut, exception explicite auditée. | VERIFIED |
| `OPS-03` | P1 | 9 + A RC5 | Validation restore historiquement limitée à trois tables, puis au seul caractère non nul du ledger. | Après le lot A RC5 : égalité exacte avec `001..050` (noms, ordre, checksums) et rejets testés avant mutation pour ledger tronqué, migration absente/supplémentaire, ordre falsifié ou checksum modifié. | VERIFIED |
| `OPS-04` | EXT | 9 | Aucun exercice réel avec RTO et copie chiffrée prouvés. | Rapport daté sans données de production. | BLOCKED_EXTERNAL |
| `REL-01` | P0 | 12 | Aucun tag de release immuable. | Tag signé/protégé et release GitHub sur le SHA final. | OPEN |
| `REL-02` | P0 | 12 | VPS différent du candidat audité. | `/api/health.version` égale le SHA du tag. | OPEN |
| `REL-03` | P1 | 12 | Headers et anciens bundles attestent un déploiement antérieur. | Recette HTTPS et digests d'images consignés. | OPEN |
| `REL-04` | EXT | 12 | SMTP, navigateurs cibles et rollback non recettés sur le candidat. | Procès-verbal de recette daté. | BLOCKED_EXTERNAL |

### Tests, dépôt et dossier

| ID | Niveau | Lot | Constat | Preuve de fermeture | État |
| --- | --- | ---: | --- | --- | --- |
| `TEST-01` | P1 | 10 | Couverture partielle parfois présentée sans son périmètre. | Rapports et dossier parlent de couverture ciblée. | VERIFIED |
| `TEST-02` | P1 | 10 | Contrôles de fiabilité surtout fondés sur des recherches de chaînes. | Contrats critiques couverts par comportement. | VERIFIED |
| `TEST-03` | P1 | 10 | E2E limités aux machines et arbitrages mobiles. | Auth, cycle complet, rôles, Board, Pilotage et Admin couverts. | VERIFIED |
| `TEST-04` | P1 | 10 | Courses, outbox, analytics, support et restauration absents de l'intégration réelle. | Suites PostgreSQL et exercices dédiés, isolés et répétables. | VERIFIED |
| `TEST-05` | P2 | 10 | Avertissements jsdom/React et absence de volumétrie. | Sorties propres et scénario de charge documenté. | VERIFIED |
| `DOC-01` | P0 | 11 + G RC5 | Ancien dossier : 12 tables, 38 migrations, 579 tests, 4 jobs et 2 E2E. | RC5 : 15 tables, 50 migrations et 6 jobs dérivés du dépôt ; les totaux de tests restent paramétrés et ne sont publiés qu'avec leurs rapports verts. | VERIFIED_LOCAL_RC5 |
| `DOC-02` | P1 | 11 + G RC5 | `rebuildDossier.py` conservait des faits volatils en dur. | Le générateur dérive les faits techniques, mais sa chaîne source/assets et les données externes ou personnelles restent à décider ou fournir. | OPEN |
| `DOC-03` | P1 | 11 + G RC5 | Sources suivies avec marqueurs techniques incomplets et anciens candidats. | Les faits déterminables par le dépôt sont resynchronisés ; les marqueurs personnels, de capture et de preuve externe restent volontairement ouverts. | OPEN |
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
| `3` | Aligner verrous, revalidations et invariants ligne/utilisateur/incident. | `CON-01` à `CON-04`, `AUTH-01` | Lots 1 et 2 | VERIFIED |
| `4` | Unifier les contrats d'authentification et HTTP. | `HTTP-01` à `HTTP-10` | Lot 3 | VERIFIED |
| `5` | Rendre l'outbox observable et résistante aux reprises partielles. | `OUT-01` à `OUT-05` | Lots 3 et 4 | VERIFIED |
| `6` | Définir et fiabiliser périodes, rôles et KPI du Pilotage. | `ANA-01` à `ANA-06` | Lot 3 | VERIFIED |
| `7` | Paginer les listes sans perdre la projection opérationnelle active. | `LIST-01` à `LIST-04` | Lot 6 | VERIFIED |
| `8` | Corriger la sémantique et prouver les parcours accessibles. | `A11Y-01` à `A11Y-06` | Lots 4 et 7 | VERIFIED |
| `9` | Durcir et exercer sauvegarde/restauration. | `OPS-01` à `OPS-04` | Lot 3 | OPEN |
| `10` | Remplacer les preuves textuelles fragiles par des tests comportementaux. | `TEST-01` à `TEST-05` | Lots 1 à 9 | VERIFIED |
| `11` | Régénérer un dossier exact, reproductible et conforme. | `DOC-01` à `DOC-06`, `GOV-01` | Lots 1 à 10 | OPEN |
| `12` | Construire, déployer et recetter le candidat immuable. | `REL-01` à `REL-04` | Lots 1 à 11 | OPEN |

Le lot 3 est livré en sous-lots ordonnés afin que chaque invariant dispose de sa
preuve propre :

| Sous-lot | Périmètre | Constats | État |
| --- | --- | --- | --- |
| `3A` | Revalider l'utilisateur affecté, sérialiser son cycle de vie et révoquer les sessions après changement d'autorité. | `CON-04`, `AUTH-01` | VERIFIED |
| `3B` | Verrouiller et revalider les lignes, puis geler leurs champs structurels tant qu'un incident actif les référence. | `CON-01`, `CON-02`, `CON-03` | VERIFIED |

Les lots 4 et 5 suivent le même découpage de preuve :

| Sous-lot | Périmètre | Constats | État |
| --- | --- | --- | --- |
| `4A` | Signer les cookies, refuser leur altération et empêcher le cache des API authentifiées. | `HTTP-01`, `HTTP-02` | VERIFIED |
| `4B` | Unifier révocation, réauthentification et identifiants. | `HTTP-03` à `HTTP-05` | VERIFIED |
| `4C` | Durcir le client HTTP, les secrets bcrypt et les erreurs frontend. | `HTTP-06` à `HTTP-10` | VERIFIED |
| `5A` | Récupérer les leases et rendre chaque issue de livraison observable. | `OUT-01`, `OUT-02` | VERIFIED |
| `5B` | Figer les destinataires et isoler leurs reprises. | `OUT-03` à `OUT-05` | VERIFIED |
| `7A` | Paginer le Journal par curseur (tri stabilisé par `id`, bouton de suite). | `LIST-03` | VERIFIED |
| `7B` | Paginer l'Historique par curseur. | `LIST-01` | VERIFIED |
| `7C` | Paginer la Connaissance par curseur. | `LIST-02` | VERIFIED |
| `7D` | Séparer les suivis résolus du Dashboard en liste paginée indépendante. | `LIST-04` | VERIFIED |

Preuves des lots clos :

- lot 0 : commit `064884da348db2c106791033e1fa6772e837cd90` et
  [run CI 242](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29687592997) ;
- lot 1 : commit `4e4acfc4f8e37586a1348b7be67f899404660af9` et
  [run CI 244](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29691306837) ;
- lot 2 : commit `091433fd36a866e2af0a108be4a33a9369f74ca3` et
  [run CI 246](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29692190921) ;
- lot 3A : commit `5fbbbdd541dc50b3876b730effd7be6bcc5d64ec` ;
- lot 3B : commits `51f53ebbefd7cf3b1d212c77fc13910e842615ea` et
  `924e81f2cf317af4c63e7b32ee9dbc1dbe43cea8` ;
- validation commune des lots 3A et 3B, y compris les fixtures E2E isolées :
  commit `85ae0e078f884b1409ba507355b966e72ec9f1f1` et
  [run CI 251](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29704087931) ;
- lot 4A : implémentation `ade07b1a59a2eadca94fc704fc540817abd6ce8f`,
  correction du harnais navigateur `6cdc7898894cbe13bc183b24f1beaff105afcf8a`
  et [run CI 254](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29705503071).
- lot 4B : commit `4f35a5b93dc4fd3d1011742714fe03b436936388` et
  [run CI 256](https://github.com/AmineAKIK/sentinel-fullstack/actions/runs/29706833863),
  avec migration PostgreSQL `046` et neuf parcours Playwright.
- lot 4C : commit `424f5ab78dc9cb8a4e5a647efaa0e356134de3a2`. Contrôles locaux
  exécutés : `format:check`, `lint`, `typecheck:scripts`, `build` et `test`
  backend (425/425) et frontend (359/359) verts sur les deux périmètres. Run CI
  distant à confirmer après push.
- lot 5A : commit `9691dad6f526b3b6b563a0bd4b33fae8646fe072`, migration
  PostgreSQL `047`. Contrôles locaux verts : backend 431/431 (unitaire),
  79/79 (intégration réelle sur base jetable, migrations idempotentes deux
  fois de suite), frontend 359/359.
- lot 5B : commit `bc56b423ff2199f763fa74c80ef2cd918fecdf06`, migration
  PostgreSQL `048`. Contrôles locaux verts : backend 436/436 (unitaire),
  82/82 (intégration réelle, migrations idempotentes deux fois de suite),
  frontend 359/359. Un bug d'ambiguïté de typage SQL sur
  `retryOrFailNotificationOutboxItem` (paramètre `$2` utilisé à la fois comme
  valeur et comme comparaison) n'a été détecté que par la suite d'intégration
  réelle, jamais par les tests unitaires mockés — corrigé par des casts
  explicites (`::varchar`, `::int`).

Les cinq jobs de chaque preuve sont verts, à l'exception des lots 5A et 5B dont
le run CI distant reste à confirmer après push.

### Porte A — intégrité métier

Lots `1`, `2` et `3`. Elle exige les tests de concurrence réels, zéro no-op
journalisé, une politique de verrouillage documentée et les invariants finaux
vérifiés en base.

**État : VERIFIED.** Le run CI 251 valide les cinq jobs. La suite PostgreSQL
exécute 69 tests réels ; chaque scénario de course du lot 3 est répété trois
fois et les deux issues de sérialisation utilisateur sont couvertes, sans
deadlock, trace fantôme ni état final incohérent. Les cinq parcours Playwright
confirment aussi le no-op, la mutation autorisée, le refus d'une ligne occupée
et les deux arbitrages mobiles.

### Porte B — robustesse plateforme

Lots `4` et `5`. Elle exige les contrats HTTP partagés, les sessions révocables,
des cookies altérés refusés et une outbox récupérable/testée avec panne partielle.

**État : constats fermés localement (lots 4 et 5 tous `VERIFIED`), CI distante
à confirmer.** L'outbox récupère désormais ses leases à chaque cycle de poll,
distingue `COMPLETED`/`SKIPPED_DISABLED`/`SKIPPED_NO_RECIPIENT` et isole ses
reprises par destinataire et par canal (`delivered_recipients`, migrations
`047` et `048`). La porte ne passe formellement qu'une fois le run CI complet
confirmé vert sur le commit `bc56b42`.

### Porte C — cohérence produit

Lots `6` à `10`. Elle exige les périodes et listes non ambiguës, les parcours
accessibles, la restauration démontrée et une couverture comportementale des
flux critiques.

**Lot 6 clos localement, CI distante à confirmer.** Les cohortes créés/clôturés
sont désormais indépendantes (`DR-09`), la tendance journalière ne produit plus
de plan cartésien et tronque le jour en Europe/Paris explicite (`DR-10`), la
fenêtre analytique refuse `start > end` et toute plage supérieure à 366 jours,
et le Journal accepte enfin un filtre période avec le même contrat de bornage.
Le cadrage fonctionnel a été aligné sur le code (accès Pilotage aux trois rôles,
retrait de la promesse non livrée de classement produits/synthèse textuelle).

**Lot 7 clos localement, CI distante à confirmer.** Historique, Connaissance et
Journal sont désormais paginés par curseur opaque `{sortValue, id}` (`DR-11`),
avec un tri stabilisé par `id` en tie-breaker sur les quatre écrans — aucun
tri existant n'avait de colonne réellement unique. Le Dashboard sépare la
projection active (toujours complète, sans borne) des suivis résolus, chargés
à la demande via `/workshop/incidents/followed-resolved` et paginés (`DR-12`).
Un bug latent a été corrigé au passage : `boundedInt()` ignorait silencieusement
un `limit` passé en `number` plutôt qu'en `string`, retombant sur la valeur par
défaut — invisible tant qu'aucun test n'appelait le repository directement.

**Lot 8 clos, CI distante verte sur les cinq jobs (commit `3918be3`).** La
carte incident n'imbrique
plus un bouton dans un autre bouton (`IncidentCard` : conteneur `<article>`,
seul le titre est un vrai `<button>`) et les lignes de tableau Utilisateurs/
Lignes ont perdu leur `role="button"` de substitution au profit d'une vraie
action nommée dans la cellule (`A11Y-01`, `A11Y-02`). Le filtre de type
d'action du Journal porte désormais un nom accessible (`A11Y-03`), et la fiche
utilisateur conserve la cible du lien d'évitement `#main-content` dans ses
états de chargement et d'erreur, pas seulement à l'affichage réussi (`A11Y-04`).
Les valeurs du graphique de tendance Pilotage (créés/clôturés par jour) sont
désormais exposées en texte accessible en plus du `title` au survol, les
barres décoratives portant `aria-hidden` (`A11Y-05`). La règle
`jsx-a11y/aria-role` — désactivée à tort sur l'ensemble des fichiers de test —
a été resserrée au seul fichier où elle produisait un faux positif réel (la
prop métier `role` d'`IncidentMetricsBar`, confondue avec un rôle ARIA), avec
la justification en commentaire ; les autres exceptions `jsx-a11y` restantes
(`no-autofocus`, `label-has-associated-control`) étaient déjà justifiées et
documentées. Une suite E2E `axe-core` (`@axe-core/playwright`) couvre
désormais douze parcours authentifiés et publics (connexions Admin/Atelier,
Board, dashboard, Journal, Historique, Connaissance, Pilotage, accueil Admin,
listes Utilisateurs/Lignes, fiche utilisateur) sans violation `serious` ou
`critical` WCAG 2 A/AA — la preuve automatisée qui manquait (`A11Y-06`).

La confirmation CI a mis au jour trois défauts préexistants, sans rapport avec
l'accessibilité, corrigés dans la foulée pour rouvrir la porte : `verify:
reliability` référençait encore `trendRows`, la variable renommée en
`createdTrendRows`/`closedTrendRows` lors du lot 6 ; le lockfile frontend
comme le lockfile backend contenaient des entrées `@emnapi/*` sous-figées que
seul `npm ci` (pas `npm install`) rejette sous npm 11.16.0, la version exacte
utilisée par la CI ; et `js-yaml` était épinglé par un override à `4.2.0`,
dans la plage vulnérable de `GHSA-52cp-r559-cp3m`, corrigé à `4.3.0`.

**Lot 9 : `OPS-01` à `OPS-03` clos et vérifiés en conditions réelles (Docker
Compose, PostgreSQL réel) ; `OPS-04` reste `BLOCKED_EXTERNAL`, donc le lot ne
peut pas passer `VERIFIED`.** `restore.sh` acquiert désormais le même verrou de
fichier que `backup.sh` (`$BACKUP_DIR/.sentinel-backup.lock`) : les deux sens de
la contention ont été prouvés (un backup en cours bloque une restauration, et
inversement). La restauration refuse par défaut tout dump sans `.sha256`
associé, avec un message de refus explicite ; `--allow-unverified` permet de
passer outre en journalisant un avertissement audité. La validation du schéma
avant bascule est passée de trois tables à la structure complète (quinze
tables), plus le contrôle que le ledger `schema_migrations` ne contient aucun
`checksum` ni `applied_at` NULL et celui de colonnes témoins sur les tables les
plus critiques. À ce stade historique, le test produisait et rejetait un dump
hors schéma Sentinel, mais ne prouvait pas encore l'égalité exhaustive du ledger.
Un bug a été corrigé pendant la vérification : la requête de
validation plantait avec une erreur SQL brute (au lieu du message `[restore]`
attendu) quand une table centrale manquait, parce que `count(*)` sur une table
absente échoue avant que PostgreSQL n'évalue le reste du `AND` — la validation
est désormais scindée en deux passes (existence des tables, puis ledger),
chacune protégée contre l'échec de requête. Une deuxième correction a retiré
`workshop_arbitration_reads` de la liste de tables attendues : ce nom est un
résidu d'un fichier de migration renommé (`038_create_workshop_arbitration_
reads.sql` → `..._consultations.sql`, cf. l'alias dans `migrate.ts`), jamais une
table du schéma actuel — sans le rejeu réel des 48 migrations en conditions
Docker, cette erreur serait passée inaperçue et aurait fait échouer toute
restauration légitime en production.

**Après le lot A de RC5**, le comportement testé est plus strict :
`restore.sh` construit le ledger attendu depuis les migrations canoniques
`001..050`, puis compare exactement noms, ordre et checksums avant toute mutation
de la base de destination. `test-backup-restore.sh` fabrique et exige le rejet
d'un ledger tronqué, d'une migration `025` absente, d'une migration `051`
supplémentaire, d'un ordre falsifié et d'un checksum modifié.

**Lot 10, en cours : `TEST-01` et `TEST-05` clos.** Les 78 occurrences du
warning jsdom `Not implemented: Window's scrollTo()` (déclenché par `Modal`
lors de la restauration du scroll verrouillé à la fermeture) ont été
éliminées par un mock inconditionnel dans `frontend/src/test/setup.ts` —
jsdom fournit sa propre fonction non implémentée plutôt que de laisser la
propriété absente, donc un simple test de présence ne suffisait pas. Un
scénario de charge minimal (`scripts/load-test.js`, k6, débit constant sous
le seuil de rate limiting nominal) documente désormais la volumétrie,
manuel et volontairement hors CI. Le dossier jury précise maintenant que les
seuils de couverture Jest portent sur le périmètre `collectCoverageFrom`
configuré, jamais sur l'ensemble du code backend.

`TEST-04` clos, CI verte sur les six jobs (commit `bb90198`, nouveau job `Ops /
Backup and restore drill` inclus). `scripts/test-backup-restore.sh` (nouveau) exerce
`backup.sh`/`restore.sh` contre un PostgreSQL Docker Compose jetable avec les
48 migrations réellement rejouées : sauvegarde nominale, restauration
nominale avec bascule effective des données, exclusion mutuelle dans les deux
sens, refus/franchissement du checksum, et rejet d'un dump hors schéma —
dix assertions, exécutées deux fois de suite pour écarter un flake. Intégré
en CI comme nouveau job dédié `Ops / Backup and restore drill`. Un nouveau
`notificationOutboxWorker.integration.test.ts` exerce
`processNotificationOutboxBatch` (le worker, pas seulement son repository déjà
couvert) contre un incident réel créé puis pris en charge : réclamation,
livraison multi-canal dégradée en `SKIPPED_NO_RECIPIENT` (SMTP absent en
test), non-double-traitement, et classement `FAILED` en une tentative pour un
`event_type` non géré — sans jamais laisser un item bloqué indéfiniment. Le
module support (chat IA) reste volontairement sans suite d'intégration
PostgreSQL dédiée : c'est un proxy HTTP stateless sans donnée à vérifier
après coup, sa seule dépendance DB réelle (revalidation d'auth) étant déjà
couverte ailleurs (`DR-24`).

`TEST-03` clos. Quatre nouveaux fichiers E2E portent la couverture de 4 à 8
fichiers, 22 à 29 scénarios : `incident-lifecycle.spec.ts` exerce le cycle
complet création → prise en charge → suspension → reprise → clôture avec
deux comptes distincts (OPERATOR puis MAINTENANCE, ce dernier ajouté au seed
E2E qui n'avait jusqu'ici que RESPONSABLE et OPERATOR) ; `board.spec.ts`
couvre le flux fonctionnel Board (code invalide refusé, code valide donnant
accès, session persistée au rechargement — le seed configure désormais un
`board_code_hash` réel sur l'admin E2E) ; `pilotage.spec.ts` couvre les
préréglages de période, la validation de plage personnalisée invalide et le
filtre Ligne→Machine en cascade ; `admin-users.spec.ts` couvre la création
d'utilisateur de bout en bout (aperçu, code temporaire à usage unique,
présence dans la liste) et le refus d'un badge déjà pris. `SelectField`
étant un combobox ARIA custom et non un `<select>` natif, ces specs ouvrent
puis cliquent l'option plutôt que d'utiliser `selectOption()`.

Deux défauts de fond, sans rapport avec les tests eux-mêmes, ont été corrigés
en cours de route : `workshop.controller.ts` utilisait `req.workshopUser`
(augmentation de type globale déclarée dans `workshopAuth.ts`) sans jamais
importer ce module — cela ne posait problème que lorsqu'aucun autre point
d'entrée du même programme TypeScript ne chargeait `workshopAuth.ts` en
premier, ce qui était vrai jusqu'ici pour tous les scripts mais plus pour
`seedE2E.ts` une fois qu'il a dû importer `hashBoardCode` (qui dépend
transitivement du contrôleur) ; corrigé par un import de dépendance
explicite. Le générateur de code temporaire utilise un alphabet
alphanumérique restreint (chiffres 2-9, lettres sans ambiguïté visuelle), pas
des chiffres purs — un premier essai de regex trop étroit dans le test l'a
révélé.

Admin Audit et Paramètres, ainsi qu'une connexion OPERATOR autonome hors du
cycle de vie incident, restent sans E2E dédié — non bloquant, laissé pour une
passe ultérieure si le temps le permet.

**`TEST-02` clos — lot 10 entièrement `VERIFIED`.** Les trois checks textuels
les plus critiques de `verifyReliability.js` (contrats de sécurité et règles
métier) sont remplacés par du comportement réel : le contrat Board/Atelier
par le nouveau test `security-contracts.spec.ts` (section précédente) ; la
revalidation d'utilisateur du middleware par
`workshopAuthMiddleware.integration.test.ts` (nouveau, premier usage de
`supertest` dans ce projet — monte une app Express minimale avec la vraie
route de login et le vrai middleware, prouve le refus immédiat sur compte
désactivé ou rôle changé, sans attendre une nouvelle connexion) ; le contrat
« admin ne peut pas retirer une référence opérationnelle active » était déjà
prouvé sans grep par `accounts.service.test.ts`, `lines.service.test.ts` et
deux suites d'intégration — le check textuel était pur doublon, supprimé sans
nouveau test. Le script est passé de 20 à 17 checks ; les 17 restants
(routing, Board/Pilotage/Modal structurels, contrats UI) restent des
vérifications statiques volontairement légères, hors du périmètre critique de
sécurité ou de règle métier. Le miroir de permissions backend/frontend
(`workshop.policy.ts` / `workshopPermissions.ts`) reste vérifié par grep
faute d'un test de contrat croisé construit dans ce lot — chaque côté a sa
propre suite unitaire exhaustive (35 cas côté backend), mais rien ne garantit
encore leur cohérence croisée automatiquement.

### Porte D — certification

Lots `11` et `12`. Elle exige un dossier recalculé, une CI verte, un tag, des
images identifiées, un VPS au même SHA et une recette externe consignée.

**Candidat figé et release candidate publiée.** La branche
`release/v1.0.0-readiness` a été rebasée sur `main` (PR #24), CI verte sur les
six jobs au commit `c57b1f8`. Un workflow `Release` (`.github/workflows/
release.yml`) construit sur tag `v*` les images backend/frontend, vérifie leur
provenance (utilisateurs non-root, label `org.opencontainers.image.revision`
égal au SHA), les pousse vers GHCR taguées par version et par digest, et publie
une release GitHub référençant les digests immuables. Le tag `v1.0.0-rc.1` a
produit :

- backend `ghcr.io/amineakik/sentinel-fullstack/backend@sha256:c779719970…`
- frontend `ghcr.io/amineakik/sentinel-fullstack/frontend@sha256:e1f5d4941d…`

au commit `c57b1f860f083a5318c8314ccf43f760a5624dce`, images publiques et
vérifiées (le label revision de l'image poussée égale le SHA du tag). Le VPS
déploie ces images par digest via `docker-compose.registry.example.yml`, jamais
une reconstruction locale. `REL-02` (health.version == SHA) et `REL-03` (recette
HTTPS) se ferment au déploiement effectif ; `REL-01` (tag final `v1.0.0`) reste
`OPEN` : par décision, le tag final n'est créé qu'après validation complète du
dossier jury, en promouvant le même commit et les mêmes images, ou via un
`rc.2` si une correction versionnée s'avère nécessaire.

Outillage du dossier : `scripts/collectDossierFacts.py` dérive automatiquement
chaque fait chiffré depuis le dépôt. Lors de l'audit RC4, sur le candidat code
`2c5207ef4ac13ddf7413863f49df1d59fe4e0f1b`, après indexation des quatre
documents jury, il a établi 534 fichiers suivis,
50 migrations, 15 tables, 6 jobs et 1 297 tests disjoints
(`511 + 146 + 583 + 57`). `rebuildDossier.py` reçoit désormais ces valeurs en
arguments au lieu de conserver tables, migrations, jobs ou E2E en dur. Pour
RC5, le collecteur confirme les trois faits structurels `50 / 15 / 6`; les
totaux de tests doivent être recalculés avec les rapports du SHA RC5 et non
recopiés depuis cette preuve RC4.

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
