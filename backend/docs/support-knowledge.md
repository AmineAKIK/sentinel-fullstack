# Base de connaissance de l'assistant Sentinel

Tu réponds uniquement à partir de ce document, en français clair, direct et
professionnel. Tu ne cites jamais ce document, le code, les noms de tables, les
routes, les variables ou les détails techniques. Tu n'inventes pas une fonction
absente. Si la réponse ne figure pas ici, tu le dis et tu proposes de contacter
l'administrateur ou le responsable.

## Les espaces

Le portail propose trois entrées :

- **Board** : affichage grand écran en lecture seule, protégé par un code ;
- **Administration** : comptes, lignes, paramètres, sécurité et audit ;
- **Atelier** : incidents, traitement, historique, journal, pilotage,
  connaissance et assistance.

Une session Atelier peut aussi lire le Board. Le Board ne donne jamais accès à
l'Atelier ou à l'Administration, et la session Admin reste séparée.

## Les rôles Atelier

### Opérateur

L'opérateur déclare les incidents. Il peut demander une correction sur une
déclaration qu'il a créée et demander son annulation tant qu'elle n'est pas prise
en charge.

### Maintenance

La maintenance prend ou transfère une prise en charge, documente le diagnostic,
met en attente, reprend et clôture avec une note d'intervention. Elle peut
modifier un incident non pris ou l'incident qui lui est affecté.

### Responsable

Le responsable supervise l'atelier. Il arbitre les demandes des opérateurs,
marque l'urgence, ajoute une consigne, modifie les informations descriptives,
suit certains incidents et invalide une clôture si nécessaire.

### Administrateur

L'administrateur gère le référentiel et les accès. Il n'assure pas le traitement
quotidien des incidents.

## Se connecter

### Atelier

1. choisir l'espace Atelier ;
2. saisir son badge ;
3. saisir son mot de passe.

Lors d'un premier accès ou après une réinitialisation, saisir le code temporaire
remis par l'administrateur puis choisir un nouveau mot de passe. Le code est
temporaire et ne fonctionne plus après usage.

En cas d'échec, vérifier le badge, le mot de passe et l'état actif du compte. Si
le mot de passe est oublié, utiliser la demande de réinitialisation ou contacter
l'administrateur.

### Administration

Choisir l'espace Administration puis utiliser l'identifiant et le mot de passe
administrateur. Certaines actions sensibles redemandent ce mot de passe.

### Board

Choisir Board puis saisir le code local. Un utilisateur déjà connecté dans
l'Atelier peut aussi ouvrir cette vue. Le Board ne permet aucune action sur les
incidents.

## Déclarer un incident

Tous les rôles Atelier peuvent déclarer :

1. ouvrir le Dashboard ;
2. choisir Créer un incident ;
3. sélectionner ligne, machine, robot et tête ;
4. choisir le type d'anomalie ;
5. renseigner le produit en cours ;
6. ajouter un commentaire utile si nécessaire ;
7. valider.

Types d'anomalie : Skipée par machine, Skipée par conducteur, Dégradée ou
Indisponible.

Un seul incident actif est autorisé sur le même emplacement. Si la création est
refusée pour conflit, ouvrir l'incident déjà présent au lieu d'en créer un second.

## Comprendre le cycle de vie

- **Ouvert, non pris** : personne n'est encore affecté ;
- **Ouvert, pris en charge** : une maintenance est affectée ;
- **En attente** : un diagnostic existe mais une pièce, une information ou une
  action externe manque ;
- **Clôturé** : l'intervention est terminée et documentée ;
- **Annulé** : la déclaration a été annulée mais reste dans l'historique ;
- **Invalidé** : un responsable a invalidé une clôture sans rouvrir l'incident.

## Actions de la maintenance

- **Prendre en charge** un incident ouvert. Si un autre technicien est affecté,
  l'action effectue un transfert et conserve la trace de l'ancien technicien.
- **Modifier** un incident non pris ou un incident qui lui est affecté.
- **Mettre en attente** un incident pris, avec un diagnostic obligatoire.
- **Reprendre** un incident en attente avant de poursuivre.
- **Clôturer** un incident ouvert et pris, avec une note d'intervention
  obligatoire. Un incident en attente doit d'abord être repris.
- **Annuler directement** un incident actif qui n'est pas pris.

Un technicien remplaçant peut reprendre ou clôturer un incident pris. Pour que
l'affectation reflète aussi ce remplacement, il doit d'abord utiliser Prendre en
charge.

## Actions du responsable

- arbitrer une demande de correction ou d'annulation ;
- modifier les informations descriptives d'un incident actif ;
- annuler un incident actif non pris ;
- annuler un incident en attente comme décision de supervision ;
- marquer ou retirer l'urgence ;
- écrire ou modifier la consigne responsable ;
- suivre ou ne plus suivre un incident ;
- invalider une clôture avec un motif.

Le responsable ne prend pas en charge techniquement un incident et ne le clôture
pas à la place de la maintenance.

## Actions de l'opérateur

- déclarer un incident ;
- demander une correction sur sa propre déclaration active ;
- retirer sa demande de correction avant décision ;
- demander l'annulation de sa propre déclaration active, si elle n'est pas prise,
  avec un motif.

L'opérateur ne modifie pas directement sa déclaration après création. La
correction doit être décidée par un responsable.

## Arbitrer une demande

La tuile **À arbitrer** du responsable regroupe les corrections et annulations
qui attendent une décision. La pastille rouge indique les nouveaux cas qui n'ont
pas encore été explicitement consultés pour arbitrage.

Quand le responsable ouvre l'incident, une fenêtre présente le demandeur, la
date, le contexte et soit le motif d'annulation, soit la comparaison entre les
valeurs actuelles et demandées.

Trois chemins sont possibles :

- **Décider directement** : refuser ou accepter depuis la fenêtre ;
- **Reporter** : fermer la fenêtre et regarder le dossier sans marquer le cas
  comme consulté. La pastille reste et la fenêtre reviendra à la prochaine
  ouverture ;
- **Consulter le dossier** : ouvrir le dossier en marquant explicitement le cas
  comme consulté. La décision reste attendue, mais le cas n'est plus compté comme
  nouveau.

Ouvrir un dossier par un autre chemin ne marque jamais une demande comme
consultée. Accepter une annulation conserve l'incident dans l'historique. Accepter
une correction applique uniquement les valeurs présentées comme demandées.

## Le Dashboard

La partie haute contient création, indicateurs, recherche, tri et filtres. Les
indicateurs changent d'ordre selon le rôle :

- opérateur : ses déclarations puis les situations à surveiller ;
- maintenance : urgences, non pris et incidents pris par elle ;
- responsable : arbitrages, urgences, non pris, ancienneté et suivis.

Cliquer un indicateur applique son filtre. Les urgences sont affichées en premier,
puis l'ordre de traitement, la prise en charge et l'ancienneté/date.

Sur ordinateur, le dossier s'ouvre à côté de la liste. Sur téléphone, il s'ouvre
à son début pour éviter d'arriver au milieu des informations.

## Suivre un incident

Le responsable peut suivre un incident pour le retrouver facilement, même après
sa clôture ou son annulation. Il est automatiquement abonné lorsqu'il crée un
incident ou prend une décision d'arbitrage. Il peut retirer le suivi à tout
moment.

## Historique et Journal

**Historique** répond à la question « que s'est-il passé sur cet incident ? ».
Il présente le dossier complet et sa chronologie.

**Journal** répond à la question « que s'est-il passé dans l'atelier ? ». Il
regroupe les événements de tous les incidents et est réservé au responsable.

Un incident terminé disparaît de la liste active, mais reste dans l'Historique.

## Pilotage

Le Pilotage permet au responsable d'étudier une période et de filtrer par ligne
ou machine. Il présente volumes, clôtures, urgences, non pris, ancienneté,
tendances et classements.

Les incidents annulés ou invalidés ne sont pas comptés comme incidents actifs.

## Connaissance

La Connaissance regroupe les incidents clôturés qui possèdent une note
d'intervention exploitable. Chaque fiche montre le contexte, le diagnostic et la
solution appliquée. Les incidents annulés ou invalidés n'y apparaissent pas.

## Board grand écran

Le Board affiche les incidents actifs en lecture seule. Il alterne entre alertes,
vue complète et synthèse par ligne. Les réglages sont conservés séparément pour
chaque écran.

Si le Board ne s'ouvre pas sans session Atelier, vérifier le code, l'activation
du Board et la durée de session auprès de l'administrateur.

## Administration des comptes

L'administrateur peut :

- créer un compte et remettre son code temporaire ;
- modifier identité, badge, e-mail et rôle ;
- activer ou désactiver ;
- réinitialiser le mot de passe ;
- archiver logiquement un compte.

Une désactivation, un changement de rôle ou un archivage sont bloqués si le
technicien porte encore des incidents actifs. Il faut d'abord clôturer ou
transférer ces incidents.

## Administration des lignes

L'administrateur peut créer une ligne, configurer ses machines et robots,
modifier l'ordre des machines, activer ou archiver.

Un numéro de ligne ou un identifiant machine ne peut pas être utilisé deux fois
dans le référentiel actif. Une ligne avec incidents actifs ne peut pas être
désactivée sans traiter l'impact présenté.

## Problèmes courants

### Je ne peux pas clôturer

Vérifier que l'incident est pris, qu'il est Ouvert et qu'une note d'intervention
est renseignée. S'il est En attente, le reprendre d'abord.

### Je ne peux pas modifier

Une demande d'arbitrage peut bloquer les modifications concurrentes. La
maintenance ne peut modifier après prise que l'incident qui lui est affecté ; le
responsable peut modifier un incident actif lorsqu'aucun arbitrage n'est ouvert.

### Je ne peux pas créer sur une tête

Un incident actif existe probablement déjà sur ce même emplacement, ou la tête
ne correspond pas à la configuration de la machine.

### La demande est toujours dans À arbitrer

Reporter conserve volontairement le cas comme nouveau. Pour le marquer consulté,
utiliser Consulter le dossier ; pour le retirer de la file, prendre une décision.

### L'incident a disparu

Un incident clôturé, annulé ou invalidé quitte la liste active. Le retrouver dans
l'Historique, ou dans les Suivis pour un responsable encore abonné.

### Je ne peux pas désactiver un compte ou une ligne

Consulter l'impact affiché. Les références portant des incidents actifs doivent
être traitées ou transférées avant l'opération.

### Le support ne répond pas

Le fournisseur d'assistance peut être absent ou temporairement indisponible.
Réessayer plus tard ; cela n'empêche pas les autres fonctions de Sentinel.
