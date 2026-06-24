# Audit & stress-test de mise en production — Sentinel

Ce document est la checklist d'audit **go / no-go** avant de déclarer Sentinel
prêt pour la production. Il ne suffit pas que « ça marche » : on vérifie
fiabilité, sécurité, performance, accessibilité et exploitabilité, comme le ferait
une équipe produit sérieuse.

**Règle d'or :** une ligne en ❌ bloque la mise en prod tant qu'elle n'est pas
traitée ou explicitement acceptée comme risque connu.

Légende : ✅ vérifié OK · ⚠️ à vérifier · ❌ bloquant · N/A hors périmètre.

---

## 0. Pré-requis de l'audit

- Environnement de test **iso-prod** (mêmes images Docker, `NODE_ENV=production`,
  base PostgreSQL dédiée, jamais la prod réelle).
- Jeu de données réaliste : utiliser `seedWorkshopProductionDemo.js` puis amplifier
  (voir §4) — pas 3 incidents, mais des centaines.
- Un backup pris avant tout test destructif.

---

## 1. Fondations qualité (déjà en place — à confirmer vertes)

| # | Contrôle | Comment | Critère |
|---|----------|---------|---------|
| 1.1 | Lint backend + frontend | `npm run lint` (×2) | 0 erreur |
| 1.2 | Build backend + frontend | `npm run build` (×2) | 0 erreur TS |
| 1.3 | Tests unitaires backend | `npm test -- --selectProjects unit` | 100 % passent |
| 1.4 | Tests intégration backend | `npm test -- --selectProjects integration` (Postgres requis) | 100 % passent |
| 1.5 | Tests frontend | `npm test` | 100 % passent |
| 1.6 | Reliability checks | `node scripts/verifyReliability.js` | tous passent |
| 1.7 | Build images Docker | `docker compose build` | succès |
| 1.8 | CI verte sur la branche | GitHub Actions | tous les jobs ✅ |

> Ces 8 points sont déjà couverts par la CI. L'audit confirme qu'ils sont verts
> sur le commit candidat à la prod.

---

## 2. Couverture de test (combler les trous)

| # | Contrôle | État | Action |
|---|----------|------|--------|
| 2.1 | Couverture backend mesurée | ⚠️ | Lancer `npm test -- --coverage`, viser ≥ 70 % sur les services/policies (le cœur métier). |
| 2.2 | Couverture frontend mesurée | ⚠️ | `npm test -- --coverage` ; cibler utils + composants critiques (cartes, modals). |
| 2.3 | **Parcours E2E critiques** | ❌ absent | Voir §3 — le plus gros manque actuel. |
| 2.4 | Tests des invariants métier | ✅ | Couverts par les tests d'intégration workshop (cycle de vie incident, permissions). |

---

## 3. Tests end-to-end (parcours réels — à créer)

C'est le **principal angle mort**. Les premium valident les parcours complets dans
un vrai navigateur (Playwright recommandé : rapide, multi-navigateurs, headless en
CI). Scénarios bloquants à couvrir :

| # | Parcours | Rôle |
|---|----------|------|
| 3.1 | Connexion admin → créer un utilisateur → récupérer le code de setup | Admin |
| 3.2 | Première connexion atelier (badge + code → définition mot de passe) | Opérateur |
| 3.3 | Cycle de vie complet d'un incident : déclarer → prendre en charge → mettre en attente → reprendre → clôturer | Opérateur + Maintenance |
| 3.4 | Demande de correction opérateur → approbation responsable | Opérateur + Responsable |
| 3.5 | Demande d'annulation → revue → décision | Opérateur + Responsable |
| 3.6 | Accès board par code → affichage lecture seule → rotation des vues | Board |
| 3.7 | Consultation Connaissance → ouverture d'un cas similaire | Maintenance |
| 3.8 | Déconnexion / expiration de session → redirection login | Tous |

**Référence existante :** `docs/manual-tests.md` décrit déjà ces scénarios à la
main. L'objectif est de les **automatiser** (au moins 3.1–3.3, les plus critiques).

---

## 4. Performance & charge (stress-test)

Objectif : confirmer que Sentinel tient avec des données et un trafic réalistes,
pas seulement avec 3 incidents.

### 4.1 Volume de données
- Amplifier le seed à **5 000–10 000 incidents**, 50 lignes, 200 machines.
- Vérifier que Dashboard, Board, Pilotage, Historique, Connaissance **restent
  fluides** (< 1 s de rendu perçu) avec ce volume.
- Surveiller les requêtes SQL lentes : activer les logs Postgres `log_min_duration_statement`.

### 4.2 Charge HTTP (outil : **k6** ou **Artillery**)
| # | Test | Cible | Critère |
|---|------|-------|---------|
| 4.2.1 | Montée en charge `/api/health` | 50 → 200 req/s | p95 < 200 ms, 0 erreur 5xx |
| 4.2.2 | Lecture incidents `/api/workshop/incidents` (authentifié) | 50 utilisateurs simultanés | p95 < 500 ms |
| 4.2.3 | Board `/api/board` (lecture seule, fort trafic potentiel) | 100 req/s soutenu 5 min | stable, pas de fuite mémoire |
| 4.2.4 | Création d'incidents en rafale | 20 req/s | pas de doublon, intégrité respectée |

### 4.3 Endurance
- Laisser tourner 30 min sous charge modérée ; surveiller `docker stats` :
  la mémoire backend ne doit **pas croître linéairement** (fuite).

### 4.4 Pagination / limites
- Confirmer que les listes sont bornées (limites déjà en place : 500 max sur les
  queries). Aucune requête ne doit ramener « tout » sans borne.

---

## 5. Sécurité (audit ciblé)

| # | Contrôle | État | Comment |
|---|----------|------|---------|
| 5.1 | Secrets jamais en dur / jamais loggés | ✅ | Logs redacted (cookie, authorization) ; secrets via `.env`. |
| 5.2 | Refus de démarrer si secrets faibles en prod | ✅ | Logique dans `config/production.ts`. |
| 5.3 | Headers de sécurité | ✅ | `securityHeaders` (HSTS, nosniff, frame-options, CSP). À re-vérifier en prod réelle avec [securityheaders.com](https://securityheaders.com). |
| 5.4 | Rate limiting login + global | ✅ | `loginRateLimit` + `globalApiRateLimit`. Tester qu'un brute-force est bien bloqué (429). |
| 5.5 | Limite taille payload | ✅ | `express.json({ limit: '50kb' })`. |
| 5.6 | Bornes de longueur sur tous les champs | ✅ | `FIELD_LIMITS` + Zod (audité précédemment). |
| 5.7 | Autorisation : chaque route protégée | ✅ | `router.use(adminAuth/workshopAuth)` avant chaque route. |
| 5.8 | Cookies HTTP-only + Secure en prod | ⚠️ | Confirmer `secure: true` effectif derrière HTTPS (Caddy/Nginx). |
| 5.9 | `npm audit` sans vuln high/critical | ✅ | Dans la CI (`--audit-level=high`). Re-lancer au moment de la release. |
| 5.10 | Test d'injection SQL | ✅ | Requêtes paramétrées (audité). Re-confirmer via un fuzzing léger sur les champs de recherche. |
| 5.11 | Pas d'accès aux routes admin avec un token atelier (et inversement) | ⚠️ | À tester explicitement (cross-role). |
| 5.12 | CORS restreint à l'origine de prod | ⚠️ | Vérifier `CLIENT_ORIGIN` exact, pas de wildcard. |

---

## 6. Accessibilité (a11y)

| # | Contrôle | État | Outil |
|---|----------|------|-------|
| 6.1 | Audit automatisé par page | ⚠️ | **axe-core** / Lighthouse a11y ≥ 90 sur chaque écran. |
| 6.2 | Navigation clavier complète | ⚠️ | Tab/Enter/Échap sur modals, cartes, formulaires (déjà amorcé : `role`, `aria-label`, focus-visible). |
| 6.3 | Contraste des couleurs | ⚠️ | Vérifier la grammaire d'attention (texte/fond) en ratio AA (4.5:1). |
| 6.4 | Lecteur d'écran | ⚠️ | Passe rapide VoiceOver/NVDA sur les parcours clés. |
| 6.5 | `prefers-reduced-motion` respecté | ✅ | Déjà en place. |

---

## 7. Robustesse & dégradation gracieuse

| # | Scénario | Comportement attendu |
|---|----------|----------------------|
| 7.1 | Backend coupé pendant l'usage | Le front affiche une erreur claire, pas un écran blanc (ErrorBoundary en place). |
| 7.2 | DB injoignable | `/api/health` renvoie 503 ; le front dégrade proprement. |
| 7.3 | DeepSeek (chat) indisponible | Le support se désactive sans casser l'app (déjà géré). |
| 7.4 | Réseau lent / latence | Skeletons et états de chargement s'affichent (déjà en place). |
| 7.5 | Données corrompues / champs nuls | Pas de crash (états vides « Non renseigné », `?? '—'`). |
| 7.6 | Double-soumission de formulaire | Boutons désactivés pendant `loading` (à confirmer partout). |

---

## 8. Compatibilité

| # | Cible | Critère |
|---|-------|---------|
| 8.1 | Chrome / Firefox / Safari / Edge récents | Rendu et fonctionnement OK |
| 8.2 | Mobile (atelier sur tablette/téléphone) | Responsive validé (breakpoints en place) |
| 8.3 | Board sur grand écran / TV | Lisibilité de loin, rotation des vues OK |

---

## 9. Exploitation & reprise (déjà documenté — à éprouver)

| # | Contrôle | Référence |
|---|----------|-----------|
| 9.1 | Backup DB fonctionne et restaure | `docs/runbook.md` §3-4 — **tester une restauration réelle** sur env temporaire |
| 9.2 | Migrations rejouables sans casse | Démarrage backend rejoue les migrations (idempotentes) |
| 9.3 | Rollback applicatif | `docs/runbook.md` §11 |
| 9.4 | Rotation des secrets | `docs/runbook.md` §6 |
| 9.5 | Monitoring `/api/health` externe | UptimeRobot ou équivalent (§9 runbook) |
| 9.6 | Logs consultables sans fuite de secret | ✅ redaction en place |

---

## 10. Recette manuelle finale

Exécuter intégralement `docs/manual-tests.md` sur l'environnement iso-prod, puis
la `docs/release-checklist.md`.

---

## Décision Go / No-Go

La mise en production est validée **uniquement si** :

1. §1 (fondations) entièrement ✅ ;
2. §3 : au moins les parcours 3.1–3.3 automatisés et verts (ou recette manuelle
   complète signée) ;
3. §4 : aucun écroulement ni fuite mémoire sous charge réaliste ;
4. §5 : aucun point sécurité en ❌ ; les ⚠️ tranchés (vérifiés ou risque accepté) ;
5. §6 : a11y ≥ 90 sur les écrans principaux ;
6. §9.1 : une restauration de backup réellement testée.

Tout ❌ non traité = **No-Go**.

---

## Priorisation réaliste (si le temps est limité)

Dans l'ordre de criticité, pour un projet d'examen avec jury :

1. **Confirmer §1 vert** (rapide, déjà en place) — non négociable.
2. **§5.8, §5.11, §5.12** (sécurité, 3 vérifs ciblées) — rapide, fort enjeu.
3. **§4.1 volume de données** (seed amplifié) — révèle les vrais problèmes de perf.
4. **§9.1 restauration de backup** — prouve l'exploitabilité.
5. **§3.1–3.3 E2E** (Playwright) — le plus gros chantier, mais le plus probant
   devant un jury.
6. **§6 a11y** (Lighthouse) — rapide, valorisant.
