# Préparation de release — statut et historique

> **Document de statut, pas source métier.** Les anciens registres RC3–RC5 sont
> historiques et ne décrivent plus l'état courant de sécurité, de CI ou de
> production. Les contrats actuels sont dans les cinq documents de référence :
> [collaboration](collaboration.md), [conception](conception.md),
> [design](design.md), [technique](technique.md) et
> [production](production.md).

## État de préparation RC9 au 16 septembre 2026

Le dépôt est en gel fonctionnel : aucune nouvelle fonctionnalité métier n'est
introduite pour le candidat d'examen. La remédiation sécurité RC9 a remplacé
l'ancienne politique d'exceptions temporaires par une politique sans exception
active (`security/dependency-exceptions.json`, `exceptions: []`). Les quatre
périmètres npm audités lors de cette revue — backend runtime, backend complet,
frontend runtime et frontend complet — ne remontaient aucune vulnérabilité.

Le candidat ne doit être tagué qu'après fermeture des portes documentaires,
CI finale sur le vrai SHA de `main`, puis audit hostile du dépôt. Après le tag,
le workflow de release doit construire les images depuis ce même SHA, publier
les digests/SBOM/attestations, puis la production doit être déployée avec ces
digests et `/api/health.version` doit égaler le SHA du tag.

La preuve de production actuellement consignée dans le dépôt reste la
photographie historique RC8 du 31 juillet 2026. Elle ne constitue pas une
preuve de déploiement RC9. Voir [production.md §16](production.md#16-état-vérifié-historique-de-linstance-publique).

## Portes RC9

| Porte | Critère de fermeture |
| --- | --- |
| Dépendances | politique sans exception expirée ; quatre audits npm revus ; aucune PR Dependabot laissée sans décision |
| Documentation | cinq documents de référence et README cohérents avec le code courant ; documents historiques explicitement datés |
| CI | six jobs obligatoires verts sur le SHA candidat exact |
| Gouvernance | `main` protégé, PR obligatoire, six checks stricts, aucun bypass ; tags `v*` immuables après création |
| Release | tag sur la tête exacte de `main`, validation du workflow, images par digest, SBOM et attestations |
| Production | déploiement des images de la release, health SHA exact, recette courte et trace d'intervention |
| Dossier DWWM | aligné seulement après gel du SHA final et preuve de production du candidat |

## Historique

Les registres détaillés des campagnes précédentes sont conservés dans
[`docs/archive-rc/`](archive-rc/). Ils doivent être lus comme des preuves
datées du processus de stabilisation, avec leurs versions, vulnérabilités,
exceptions, nombres de tests et décisions de l'époque. Ils ne doivent jamais
être utilisés pour décrire l'état RC9 sans revalidation.

Le précédent contenu de ce fichier décrivait principalement la stabilisation
RC5 et contenait notamment une exception dépendance expirant le 31 août 2026
et un contrat d'outbox formulé trop fortement. Ces faits restent accessibles
dans les archives et l'historique Git, mais ne sont plus présentés comme état
courant.
