# Politique de sécurité

## Signaler une vulnérabilité

Ne pas publier de secret, donnée industrielle ou preuve d'exploitation dans une
issue publique. Utiliser en priorité le canal privé de signalement de sécurité du
dépôt GitHub ou contacter directement le propriétaire du dépôt par un canal
privé établi.

Inclure uniquement les informations nécessaires :

- version ou SHA concerné ;
- composant et préconditions ;
- étapes minimales de reproduction ;
- impact estimé ;
- proposition de correction si disponible.

Ne pas tester une vulnérabilité sur une instance de production ni extraire des
données réelles.

## Périmètre

Sont notamment considérés : authentification, autorisation inter-rôles, sessions,
injection SQL/HTML, secrets, données personnelles, arbitrage concurrent,
notifications, dépendances et configuration des conteneurs.

Les signalements de bug sans impact sécurité peuvent utiliser le processus de
contribution normal.

## Traitement

Le mainteneur accuse réception en privé, reproduit sur un environnement isolé,
évalue la sévérité, prépare tests et correctif, puis publie après déploiement. Les
secrets potentiellement exposés sont révoqués sans attendre la publication.
