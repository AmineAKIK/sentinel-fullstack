# Résultats d'audit de publication — historique

> **Rapport historique.** Ce fichier ne constitue pas le verdict de release
> courant. Il conserve la trace de campagnes antérieures et renvoie vers les
> contrats actuels de [production](production.md) et le statut de préparation
> [RC9](release-readiness.md).

## Audit du 17 juillet 2026

Le candidat audité était
`a77d6cb9e449e689f34bd224b102238cac81fb6c`. Les contrôles automatisés alors
consignés comprenaient notamment installation reproductible, format/lint/types,
tests unitaires, intégration PostgreSQL, parcours Chromium et contrat
conteneurs. Le verdict rendu à cette date a ensuite été **invalidé** lorsqu'il
a été établi que le VPS public n'était pas aligné sur ce candidat.

Cette campagne reste utile comme preuve historique du processus : elle montre
qu'un résultat CI ou local ne suffit pas pour affirmer qu'un commit est en
production. L'identité de version doit être prouvée par le SHA réellement servi
et, pour les releases actuelles, par les digests des images publiées.

## Évolutions postérieures

Les états de dépendances et de sécurité de juillet/août 2026 ne doivent pas
être extrapolés. Des campagnes RC4–RC8 ont ensuite modifié les tests, la
politique de dépendances, les contrats de release et la preuve de production.
La dernière preuve de production consignée avant RC9 est la photographie RC8
du **31 juillet 2026**, détaillée dans
[production.md §16](production.md#16-état-vérifié-historique-de-linstance-publique).

La revue RC9 du **16 septembre 2026** a remplacé les anciennes exceptions de
dépendances par une politique avec `exceptions: []` et a enregistré quatre
audits npm sans vulnérabilité au moment de la revue. Le détail normatif se
trouve dans [technique.md §16](technique.md#16-sécurité-des-dépendances).

## Règle de lecture

Les nombres de tests, versions de paquets, résultats npm, SHA, décisions
`GO`/`NO-GO` et observations VPS cités dans les anciens audits sont des faits
datés attachés à leur candidat. Ils ne décrivent pas automatiquement le
candidat RC9.

Pour établir la **preuve de publication et de déploiement RC9**, utiliser :

1. le SHA final de `main` et les six jobs CI sur ce SHA ;
2. la politique et les lockfiles de dépendances du même candidat ;
3. le tag/release construit depuis ce SHA, avec digests, SBOM et attestations ;
4. la vérification après déploiement que `/api/health.version` égale le SHA du
   tag ;
5. la recette et la trace d'intervention correspondantes.

La décision globale de préparation RC9 reste régie par les autres portes de
[release-readiness.md](release-readiness.md), notamment documentation,
gouvernance et alignement final du dossier DWWM.

Les rapports détaillés des candidats antérieurs restent disponibles dans
[`docs/archive-rc/`](archive-rc/) et dans l'historique Git.
