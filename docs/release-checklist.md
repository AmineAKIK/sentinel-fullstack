# Checklist de publication Sentinel

Une publication est autorisée uniquement lorsque chaque contrôle applicable est
coché et rattaché au commit candidat.

La stabilisation `v1.0.0` est pilotée dans
[release-readiness.md](release-readiness.md). Aucun candidat ne peut recevoir un
`GO` tant qu'un constat `P0` ou `P1` de ce registre n'est pas `VERIFIED`.

## 1. Dépôt

- [ ] la branche cible est `main` et synchronisée avec `origin/main`
- [ ] `git status --short` ne contient aucun fichier inattendu
- [ ] aucun `.env`, secret, export de données, PDF/DOCX personnel ou artefact de build n'est suivi
- [ ] `git diff --check` ne signale aucune erreur d'espace ou marqueur de conflit
- [ ] les migrations déjà publiées n'ont pas été modifiées
- [ ] toute nouvelle migration est séquentielle, relue et couverte par un test réel
- [ ] README, architecture, cycle de vie, runbook et déploiement décrivent le code du commit

## 2. Backend

```bash
cd backend
npm ci
npm run format:check
npm run lint
npm run typecheck:scripts
npm run build
npm run test:coverage
npm run verify:reliability
npm audit --omit=dev --audit-level=high
```

- [ ] toutes les commandes réussissent
- [ ] les seuils Jest restent au-dessus de 80 % statements, 75 % branches,
      70 % fonctions et 85 % lignes sur le périmètre critique
- [ ] aucun test ciblé, ignoré ou exclusif n'a été laissé par erreur
- [ ] les mutations critiques restent transactionnelles et actor-aware
- [ ] les erreurs SQL attendues sont traduites sans fuite d'information
- [ ] l'arrêt SIGTERM ferme HTTP, worker d'outbox et pool PostgreSQL proprement

## 3. PostgreSQL réel

Exécuter sur une base dédiée et jetable :

```bash
cd backend
export DATABASE_URL=postgres://sentinel:<password>@localhost:5432/sentinel_test
npm run test:integration
```

- [ ] les migrations partent d'une base vide
- [ ] une seconde exécution du runner est idempotente
- [ ] les suites auth, comptes, lignes et atelier réussissent
- [ ] les contraintes SQL refusent les payloads et transitions invalides
- [ ] le ledger de migrations contient un checksum pour chaque migration

## 4. Frontend

```bash
cd frontend
npm ci
npm run format:check
npm run lint
npm run build
npm run test:coverage
npm audit --omit=dev --audit-level=high
```

- [ ] toutes les commandes réussissent
- [ ] les seuils Vitest restent au-dessus de 85 % statements, 80 % branches,
      90 % fonctions et 90 % lignes sur le périmètre critique
- [ ] les appels annulés ne produisent ni erreur visible ni état obsolète
- [ ] les mutations empêchent les doubles soumissions
- [ ] les modales restaurent le focus, piègent Tab et répondent à Escape
- [ ] les erreurs métier restent distinguées des erreurs réseau/timeout

## 5. Parcours E2E

```bash
cd frontend
npx playwright install chromium
npm run test:e2e
```

- [ ] modification d'une machine simple validée
- [ ] passage simple vers double robot validé
- [ ] arbitrage d'annulation décidé directement dans la modale mobile
- [ ] arbitrage de correction décidé directement dans la modale mobile
- [ ] Reporter conserve le cas actif et ouvre le dossier en haut sur mobile
- [ ] aucune modale, aucun bouton et aucun contenu ne déborde horizontalement
- [ ] le body est verrouillé pendant une modale et redevient scrollable après fermeture

## 6. Configuration production

- [ ] `.env` provient de `.env.release.example` et a le mode `600`
- [ ] tous les placeholders ont été remplacés
- [ ] `BUILD_SHA` est égal à `git rev-parse HEAD`
- [ ] `CLIENT_ORIGIN` cible le domaine HTTPS réel
- [ ] `CADDY_DOMAIN` cible ce domaine avec le frontal intégré, ou Caddy est
      désactivé par l'override Nginx hôte
- [ ] `VITE_API_URL` est vide pour l'API same-origin
- [ ] `TRUST_PROXY=true` derrière le proxy inverse retenu
- [ ] `COOKIE_SECRET` et `JWT_SECRET` sont longs, aléatoires et distincts
- [ ] `POSTGRES_PASSWORD` est long et cohérent avec `DATABASE_URL`
- [ ] `BOARD_ACCESS_CODE_HASH` est un hash bcrypt valide `$2...`
- [ ] les variables admin ne servent qu'au bootstrap d'une base vide
- [ ] SMTP/DeepSeek sont configurés ou leur désactivation est acceptée explicitement
- [ ] `docker compose config --quiet` réussit

## 7. Conteneurs

- [ ] les images backend et frontend se construisent sans cache local implicite
- [ ] l'image backend ne contient ni tests compilés, ni déclarations, ni sources maps
- [ ] backend et frontend s'exécutent avec les utilisateurs `node` et `nginx`
- [ ] Nginx démarre avec filesystem read-only et `/tmp` dédié
- [ ] la configuration Caddy est valide pour la distribution autonome
- [ ] seuls 80/443 sont publics ; la variante Nginx hôte ne lie l'API et le
      frontend qu'à `127.0.0.1`
- [ ] PostgreSQL n'est attaché qu'au réseau interne
- [ ] healthchecks backend, frontend et PostgreSQL passent
- [ ] les logs sont bornés par rotation
- [ ] ShellCheck valide `scripts/backup.sh` et `scripts/restore.sh`

## 8. Recette manuelle

- [ ] portail et trois espaces accessibles selon leurs droits
- [ ] authentification, déconnexion et expiration de session vérifiées
- [ ] compte inactif/supprimé refusé immédiatement
- [ ] création, prise en charge, attente, reprise et clôture d'incident vérifiées
- [ ] demande, report, consultation et décision d'arbitrage vérifiés
- [ ] changement de rôle en session pris en compte côté serveur
- [ ] historique, journal, pilotage et connaissance cohérents
- [ ] Board refusé sans session, puis fonctionnel par code dédié et par session Atelier
- [ ] affichage mobile 393 x 851 et desktop 1920 x 1080 contrôlé
- [ ] navigation clavier et libellés accessibles contrôlés

## 9. Exploitation

- [ ] backup pré-déploiement créé et checksum vérifié
- [ ] copie hors site confirmée
- [ ] restauration testée sur un environnement isolé
- [ ] compatibilité du schéma avec le rollback évaluée
- [ ] métrique de santé et logs consultables
- [ ] fenêtre, responsable et procédure de retour arrière définis

## 10. Publication

- [ ] CI GitHub verte sur le SHA exact à publier, sur `main`
- [ ] commit et message de publication relus
- [ ] tag de version créé sur ce SHA (`v1.0.0-rc.N` puis `v1.0.0`)
- [ ] le workflow `Release` a construit et poussé les images GHCR sans échec
- [ ] la release GitHub référence les deux digests d'images immuables
- [ ] déploiement effectué par image de registry épinglée par digest
      (`docker-compose.registry.yml`), pas par reconstruction locale
- [ ] `/api/health` répond HTTP 200 après déploiement
- [ ] la propriété `version` de `/api/health` égale le SHA du tag déployé
- [ ] les digests des images déployées égalent ceux de la release
- [ ] logs post-déploiement sans erreur inattendue
- [ ] recette courte Admin/Atelier/Board réussie
- [ ] SHA, tag, digests d'images et résultat de recette consignés

**Décision :** `GO` seulement si aucun point bloquant n'est ouvert. Toute
dérogation doit être écrite, limitée dans le temps et assortie d'un responsable.
