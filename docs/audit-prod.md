# Protocole d'audit de production Sentinel

Ce protocole complète la [checklist de publication](release-checklist.md). Il
décrit les campagnes qui exigent un environnement iso-production et ne doivent
pas être confondues avec les contrôles automatiques de chaque commit.

## 1. Conditions de départ

- commit candidat identifié par SHA et CI entièrement verte ;
- images construites depuis ce SHA, sans modification locale ;
- environnement séparé de la production mais de topologie identique ;
- configuration `NODE_ENV=production` avec secrets temporaires forts ;
- PostgreSQL dédié et backup initial ;
- jeu de données anonymisé ou synthétique ;
- fenêtre et responsable de test définis.

Une ligne en échec non expliquée bloque le GO.

## 2. Contrats automatiques obligatoires

Les six jobs de `.github/workflows/ci.yml` doivent réussir :

| Contrat | Preuve |
| --- | --- |
| Backend | format, lint, typecheck scripts, build, couverture, fiabilité, audit npm |
| Frontend | format, lint, build, couverture, audit npm |
| PostgreSQL | migrations et suites d'intégration sur base réelle |
| Navigateur | parcours Playwright et mobile arbitration |
| Conteneurs | Compose, images non-root, Nginx, Caddy et ShellCheck |
| Exploitation | exercice sauvegarde/restauration isolé, checksum, verrou, rejet et RTO |

Vérifier également qu'aucun test n'est marqué `only`, qu'aucun artefact de test
n'est suivi et que Dependabot n'a pas d'alerte high/critical non traitée.

## 3. Données et volume

Préparer au minimum :

- 50 lignes ;
- 200 machines ;
- 10 000 incidents répartis sur plusieurs mois ;
- incidents actifs, en attente, clôturés, annulés et invalidés ;
- cas d'arbitrage actifs, consultés et décidés ;
- événements, followers et outbox représentatifs.

Mesurer, navigateur sans cache puis cache chaud :

| Vue | Objectif indicatif |
| --- | --- |
| Dashboard actif | première donnée utile < 1 s sur LAN |
| Historique filtré | réponse API p95 < 500 ms |
| Pilotage 30 jours | réponse API p95 < 1 s |
| Board | rendu stable sans croissance mémoire |
| Recherche | résultat p95 < 500 ms |

Les objectifs doivent être adaptés à l'infrastructure réelle et consignés avec
CPU, RAM, latence réseau et volume exact.

Activer temporairement `log_min_duration_statement` sur la base de test pour
identifier les requêtes lentes. Conserver les `EXPLAIN (ANALYZE, BUFFERS)` des
requêtes problématiques, sans données personnelles.

## 4. Charge et endurance

Utiliser k6, Artillery ou un outil équivalent avec des sessions réalistes.

Scénarios :

1. lecture `/api/health` de référence ;
2. lecture incidents authentifiée avec filtres variés ;
3. polling Board avec plusieurs écrans ;
4. créations concurrentes sur emplacements différents ;
5. collision volontaire sur le même emplacement ;
6. décisions concurrentes sur un même arbitrage ;
7. endurance 30 à 60 minutes à charge nominale.

Critères minimaux :

- aucune violation d'unicité métier ;
- aucun double événement métier ni double élément d'outbox pour une même source ;
- le scénario de crash après acceptation SMTP documente le risque résiduel de
  nouvel envoi inhérent à la livraison « au moins une fois » ;
- aucun 5xx inexpliqué ;
- mémoire backend sans croissance linéaire ;
- pool PostgreSQL stable ;
- p95 et taux d'erreur conformes aux objectifs définis.

Le rate limiting doit être ajusté pour la campagne sans être désactivé en
production réelle.

## 5. Sécurité dynamique

### Sessions

- token Admin présenté à une route Atelier : refus ;
- token Atelier présenté à une route Admin : refus ;
- token Board présenté ailleurs que `/api/board` : refus ;
- token Atelier autorisé sur la projection Board mais jamais sur l'Admin ;
- token signé avec autre audience/issuer/algorithme : refus ;
- changement de rôle, désactivation et rotation : session immédiatement refusée ;
- cookies `HttpOnly`, `Secure`, `SameSite=Strict` sous HTTPS.

### Entrées

- payload JSON > 50 Ko refusé ;
- recherches avec quotes, wildcards et Unicode sans injection ;
- HTML/script dans noms, commentaires, motifs, support et e-mails échappé ;
- IDs invalides et objets JSON mal formés retournent 4xx ;
- conflits SQL concurrents retournent une erreur métier stable.

### Infrastructure

- TLS valide et renouvelable ;
- headers vérifiés avec un outil externe ;
- aucun port applicatif accessible publiquement : selon la topologie, les ports
  frontend/backend sont soit non publiés (topologie A, seul Caddy expose 80/443),
  soit publiés **uniquement sur le loopback `127.0.0.1`** (topologie B, derrière
  le Nginx hôte). PostgreSQL (`5432`) n'est **jamais** publié, dans aucune
  topologie ;
- conteneurs frontend/backend non-root et read-only ;
- `.env` non lisible par les autres comptes ;
- logs sans cookie ni bearer entrant, sans `Set-Cookie` sortant, sans mot de
  passe ni clé API.

Un scan DAST peut compléter ces tests, mais ses alertes doivent être vérifiées
manuellement avant conclusion.

## 6. Accessibilité

Sur les pages principales et les deux formats 393 x 851 / 1920 x 1080 :

- Lighthouse/axe sans violation critique ;
- navigation complète au clavier ;
- ordre de focus cohérent ;
- modale : focus initial, piège, Escape, restauration ;
- lecteurs NVDA ou VoiceOver sur login, dashboard et arbitrage ;
- zoom navigateur 200 % sans perte d'action ;
- contraste AA pour texte et contrôles ;
- `prefers-reduced-motion` respecté.

Les scores automatiques ne remplacent pas la passe clavier/lecteur d'écran.

## 7. Responsive et compatibilité

Navigateurs : versions récentes de Chrome, Edge, Firefox et Safari.

Viewports :

- téléphone 393 x 851 ;
- tablette portrait/paysage ;
- desktop 1366 x 768 et 1920 x 1080 ;
- écran Board cible réel.

Contrôler : absence de scroll horizontal, taille des cibles, modales d'arbitrage,
ouverture du dossier, restauration de position, clavier virtuel, menu mobile et
rotation du Board.

## 8. Dégradations

| Panne simulée | Attendu |
| --- | --- |
| PostgreSQL coupé | santé 503, erreur explicite, aucun faux succès |
| SMTP coupé | décision métier validée, outbox en retry |
| DeepSeek lent/invalide | timeout borné, support en erreur seulement |
| backend redémarré | sessions cohérentes, worker reprend l'outbox |
| double clic / réseau lent | une mutation au plus |
| réponse précédente tardive | aucun état UI obsolète |
| SIGTERM pendant trafic | arrêt gracieux dans la fenêtre Compose |

## 9. Reprise

Campagne obligatoire sur l'environnement dédié :

1. créer un backup avec `scripts/backup.sh` ;
2. vérifier gzip et checksum ;
3. modifier des données témoins ;
4. restaurer avec `scripts/restore.sh` ;
5. comparer les données témoins et le ledger de migrations ;
6. rejouer santé, connexion, incident et audit ;
7. mesurer RTO et point de reprise obtenu ;
8. vérifier la copie hors site.

Ne jamais présenter un script non exécuté comme une restauration prouvée.

## 10. Décision

Le compte rendu doit inclure : SHA, date, environnement, versions, volumes,
commandes, métriques, captures utiles, anomalies, risques acceptés et signataires.

Décisions possibles :

- **GO** : aucun bloquant, preuves complètes ;
- **GO conditionnel** : uniquement réserves non bloquantes avec responsable et
  échéance ;
- **NO-GO** : intégrité, sécurité, reprise ou parcours critique non prouvé.
