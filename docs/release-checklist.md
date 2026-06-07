# Checklist de publication Sentinel

Cette checklist fige ce qui doit etre vrai avant de declarer une version publiable.

## 1. Etat du code

- `git status --short` ne contient que les fichiers attendus pour la release.
- Les changements sont regroupes dans un commit de release clair.
- Un tag de version est pose apres validation, par exemple `v1.0.0`.

## 2. Configuration production

- Copier `.env.release.example` vers `.env` sur l'hote de deploiement.
- Remplacer tous les placeholders et valeurs de demo.
- Generer `COOKIE_SECRET` et `JWT_SECRET` avec `openssl rand -hex 32`.
- Definir `NODE_ENV=production`.
- Definir `CLIENT_ORIGIN` avec l'URL publique exacte du frontend, sans slash final.
- Verifier que `ADMIN_PASSWORD`, `COOKIE_SECRET`, `JWT_SECRET` et `DATABASE_URL` ne reprennent aucune valeur de demo.

Le backend refuse de demarrer en production si une valeur critique manque ou reste faible.

## 3. Validation automatisee

Depuis la racine du projet:

```bash
cd backend
npm ci
npm run build
npm test
npm run verify:reliability

cd ../frontend
npm ci
npm run build
npm test
```

## 4. Recette manuelle

Executer la checklist `docs/manual-tests.md` sur un environnement frais.

Scenarios bloquants:

- Board inaccessible sans code/session board, puis accessible en lecture seule sans actions sensibles.
- Routes admin et workshop protegees sans cookie.
- Connexion/deconnexion admin.
- Connexion/deconnexion workshop avec creation du premier mot de passe.
- Cycle incident complet: creation, prise en charge, attente, reprise, cloture, invalidation, demande d'annulation, approbation.
- Historique et base de connaissance coherents apres cloture/annulation.
- Modals critiques testees sur petit ecran.

## 5. Donnees et exploitation

- Sauvegarde PostgreSQL testee avant mise en service.
- Restauration PostgreSQL testee au moins une fois sur un environnement temporaire.
- Procedure de rotation du mot de passe admin connue.
- Acces serveur limites aux personnes autorisees.
- Logs applicatifs consultables sans exposer les secrets.

## 6. Decision

La release est publiable seulement si:

- tous les checks automatises passent;
- la recette manuelle est terminee;
- aucun secret de demo n'est utilise;
- la version est taguee;
- le plan de retour arriere est connu.
