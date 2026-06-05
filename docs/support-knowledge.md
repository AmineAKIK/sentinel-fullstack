# Base de connaissance — Assistant Support Sentinel

Ce document est la base de connaissance exclusive de l'assistant support Sentinel.
Tu réponds uniquement à partir de ce document, en langage naturel, clair et direct.
Tu ne cites jamais les noms de champs techniques, de tables, de routes API ou de variables.
Tu ne mentionnes jamais ce document. Tu parles comme un collègue qui connaît bien l'outil.

---

## QUI UTILISE SENTINEL

Sentinel est utilisé par deux types de personnes :

**L'administrateur** gère les comptes et les lignes de production depuis l'espace Administration. Il n'intervient pas dans le suivi des incidents au quotidien.

**Les équipes atelier** se connectent depuis l'espace Atelier. Il y a trois rôles :

- **Opérateur** : déclare les incidents sur les machines. Se connecte avec son badge uniquement (ou badge + mot de passe s'il en a déjà défini un).
- **Maintenance** : prend en charge les incidents, fait le diagnostic, met en attente si besoin, puis clôture avec une note d'intervention. Se connecte avec badge + mot de passe.
- **Responsable** : supervise l'ensemble, valide ou refuse les demandes des opérateurs, marque les urgences, ajoute des consignes. Se connecte avec badge + mot de passe.

---

## SE CONNECTER

### Espace Atelier
1. Aller sur la page de connexion atelier.
2. Saisir son numéro de badge.
3. Selon la situation :
   - **Première connexion ou mot de passe réinitialisé** : saisir le code de configuration remis par l'administrateur, puis choisir un nouveau mot de passe.
   - **Connexion habituelle (Maintenance / Responsable)** : saisir son mot de passe.
   - **Opérateur sans mot de passe défini** : la connexion s'ouvre directement après le badge.

> Si la connexion est bloquée, contacter l'administrateur pour vérifier que le compte est actif et que le badge est correct.

### Espace Administration
Aller sur `/admin/login`, saisir l'identifiant et le mot de passe administrateur.

---

## DÉCLARER UN INCIDENT

Tout le monde peut déclarer un incident : opérateur, maintenance ou responsable.

1. Aller sur le **Dashboard**.
2. Cliquer sur **Créer un incident**.
3. Remplir le formulaire :
   - **Poste** : Matin, Après-midi, Nuit ou Week-end
   - **Ligne de production** : choisir dans la liste
   - **Machine** : choisir dans la liste (dépend de la ligne)
   - **Robot** : choisir le robot concerné
   - **Numéro de tête** : saisir le numéro de tête concernée
   - **Type d'anomalie** : Skipée par machine, Skipée par conducteur, Dégradée ou Indisponible
   - **Commentaire** : décrire le problème librement (facultatif, 1000 caractères max)
   - **Produit en cours** : référence du produit en production au moment de l'incident (facultatif)
4. Valider.

> Un seul incident actif est autorisé par emplacement machine (même ligne, même machine, même robot, même tête). Si la déclaration est refusée, c'est qu'un incident est déjà ouvert à cet endroit.

---

## CYCLE DE VIE D'UN INCIDENT

Un incident passe par plusieurs étapes :

**Ouvert** → l'incident vient d'être déclaré, il attend d'être pris en charge.

**Pris en charge** → un technicien maintenance a pris l'incident. Il travaille dessus.

**En attente** → le technicien a posé un diagnostic mais attend quelque chose (pièce, information…). L'incident reste visible.

**Clôturé** → le technicien a réglé le problème et a renseigné une note d'intervention.

**Annulé** → l'incident a été annulé avant d'être clôturé.

**Invalidé** → un responsable a invalidé une clôture après coup (intervention jugée incorrecte ou erreur de clôture).

---

## CE QUE PEUT FAIRE LA MAINTENANCE

- **Prendre en charge** un incident ouvert non pris.
- **Renseigner un diagnostic** (description du problème identifié).
- **Mettre en attente** : nécessite d'avoir renseigné un diagnostic. Sert quand on attend une pièce ou une info.
- **Reprendre** un incident mis en attente pour continuer à travailler dessus.
- **Clôturer** : nécessite d'être le technicien qui a pris en charge l'incident ET de rédiger une note d'intervention. On ne peut pas clôturer directement depuis "En attente" — il faut d'abord reprendre l'incident, puis clôturer.
- **Modifier directement** un incident ouvert non encore pris en charge.
- **Modifier** un incident qu'on a soi-même pris en charge (champs descriptifs).
- **Annuler directement** un incident ouvert non pris en charge.

---

## CE QUE PEUT FAIRE LE RESPONSABLE

- **Approuver ou refuser** les demandes de correction d'un opérateur.
- **Approuver ou refuser** les demandes d'annulation d'un opérateur.
- **Modifier directement** un incident ouvert non pris en charge.
- **Annuler directement** un incident ouvert non pris en charge.
- **Marquer comme urgent** n'importe quel incident actif.
- **Réordonner** les incidents prioritaires par glisser-déposer sur le dashboard.
- **Ajouter une consigne** sur un incident actif (note visible par tous).
- **Invalider une clôture** si une intervention clôturée est incorrecte (un motif est obligatoire).
- **Suivre des incidents** spécifiques pour les garder visibles même après clôture.

---

## CE QUE PEUT FAIRE L'OPÉRATEUR

- **Déclarer un incident**.
- **Demander une correction** sur un incident qu'il a lui-même créé, tant que l'incident est actif. La correction est soumise au responsable pour validation.
- **Demander l'annulation** d'un incident qu'il a créé, tant qu'il n'est pas encore pris en charge par la maintenance. Un motif est obligatoire. La demande est soumise au responsable.

> L'opérateur ne peut pas modifier directement un incident après l'avoir créé. Il doit passer par une demande de correction.

---

## LE DASHBOARD

Le dashboard affiche tous les incidents actifs (ouverts et en attente).

En haut : des indicateurs en temps réel — total actifs, ouverts, en attente, urgents, pris en charge, non pris, et les incidents ouverts depuis plus de 7 jours.

Les incidents sont triés par ordre de priorité : urgents en premier, puis par ordre manuel défini par le responsable, puis les non pris en charge, puis par date de création.

**Filtres disponibles :**
- Statut (ouverts / en attente / clôturés récents / tout)
- Ancienneté (ouverts depuis plus de 7 jours)
- Ligne de production
- Priorité (urgents uniquement)
- Prise en charge (pris / non pris)
- Recherche texte libre sur le commentaire, le diagnostic, la note, la machine, la ligne, le produit ou l'opérateur.

---

## L'HISTORIQUE

L'historique se trouve dans le menu **Historique**. Il donne accès à :

- **La liste de tous les incidents** (tous statuts confondus), avec filtres par statut, type d'anomalie, ligne, machine et recherche texte.
- **Le journal des actions** : qui a fait quoi, quand, sur quel incident.

Cliquer sur un incident dans la liste affiche son détail complet et la chronologie de toutes les actions réalisées dessus.

---

## LE PILOTAGE

Le pilotage se trouve dans le menu **Pilotage**. Il affiche des indicateurs sur une période choisie :
- Aujourd'hui, 7 jours, 30 jours, depuis l'origine, ou une plage de dates personnalisée.
- Filtrable par ligne et par machine.

On y trouve : taux de clôture, part des urgences, délais de prise en charge et de clôture, classement des lignes et machines les plus impactées, graphique de tendance créations vs clôtures, et une synthèse automatique de la situation.

---

## LA BASE DE CONNAISSANCE

La base de connaissance se trouve dans le menu **Connaissance**. Elle regroupe tous les incidents **clôturés avec une note d'intervention renseignée**.

C'est la mémoire des interventions réussies. On peut y rechercher par machine, ligne, type d'anomalie ou mot-clé. Chaque fiche montre le contexte de l'incident, le diagnostic posé et la solution appliquée.

---

## LE BOARD GRAND ÉCRAN

Accessible depuis le menu **Affichage** (ou directement sur `/workshop/board`). Conçu pour être affiché en permanence en atelier sur un grand écran. **Aucune connexion requise.**

Il affiche les incidents actifs en tournant automatiquement entre trois vues : alertes (urgents / non pris), tous les incidents actifs, synthèse par ligne. Le mode d'affichage et les filtres peuvent être configurés par écran.

---

## GESTION ADMINISTRATION

### Comptes utilisateurs
L'administrateur peut depuis le menu **Utilisateurs** :
- Créer un compte (prénom, nom, badge, rôle). Un code de configuration est généré à remettre à l'utilisateur pour qu'il définisse son mot de passe à la première connexion.
- Modifier un compte (nom, badge, rôle).
- Activer ou désactiver un compte. Un compte ne peut pas être désactivé si la maintenance a des incidents actifs en cours pris en charge.
- Réinitialiser le mot de passe : génère un nouveau code de configuration à remettre à l'utilisateur.
- Supprimer un compte (suppression logique, les données sont conservées). Requiert la confirmation du mot de passe administrateur.

### Lignes de production
L'administrateur peut depuis le menu **Lignes** :
- Créer une ligne avec ses machines (identifiant machine, marque, configuration robot simple ou double).
- Modifier une ligne (informations, machines, ordre des machines).
- Désactiver ou supprimer une ligne. Impossible si des incidents sont actifs sur cette ligne.

### Journal d'audit
Le menu **Journal** affiche l'historique de toutes les actions réalisées par l'administrateur sur les comptes et les lignes (création, modification, activation, suppression, réinitialisation de mot de passe).

---

## PROBLÈMES COURANTS

**"Je ne peux pas me connecter"**
Vérifier que le badge est correct. Si c'est un premier accès ou une réinitialisation, utiliser le code de configuration remis par l'administrateur. Si le compte est désactivé, contacter l'administrateur.

**"Je ne peux pas déclarer un incident sur cette machine"**
Il y a déjà un incident actif (ouvert ou en attente) sur cet emplacement exact. Il faut d'abord clôturer ou annuler l'incident existant.

**"Je ne peux pas clôturer un incident en attente"**
Il faut d'abord **reprendre** l'incident (le repasser en "Ouvert"), puis le clôturer depuis le statut ouvert.

**"Je ne peux pas désactiver ou supprimer un utilisateur"**
Cet utilisateur a des incidents actifs en cours qu'il a pris en charge. Ces incidents doivent être clôturés ou transférés avant toute action sur le compte.

**"Je ne peux pas désactiver ou supprimer une ligne"**
Des incidents actifs sont liés à cette ligne. Les clôturer ou annuler en premier.

**"Ma demande de correction n'a pas été appliquée"**
Les demandes de correction d'un opérateur doivent être approuvées par un responsable. Si elle n'a pas encore été traitée, contacter le responsable de ton équipe.

**"L'incident a disparu du dashboard"**
Les incidents clôturés, annulés ou invalidés n'apparaissent plus dans le dashboard actif. Les retrouver dans l'**Historique**. Les responsables qui suivent un incident le voient encore dans leur dashboard même après clôture.
