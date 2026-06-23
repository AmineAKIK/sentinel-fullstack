# Doctrine d'expérience — Sentinel

Ce document définit les intentions qui gouvernent l'interface de Sentinel. Il
sert de référence pour concevoir et arbitrer : une proposition d'interface se
juge sur sa conformité à ces principes, pas sur une appréciation esthétique.

**Méthode.** La doctrine est née de l'observation de terrain et du raisonnement,
avant toute lecture théorique. Les travaux cités plus loin sont des appuis qui
éclairent des intuitions déjà formées, non des autorités qui les valideraient.
Les rapprochements solides et les analogies plus libres sont distingués
explicitement.

**Périmètre.** Sentinel assure le suivi opérationnel des incidents de production
(qualité, disponibilité machine, traçabilité) et l'aide à la décision. Il n'est
pas un système de sûreté instantanée : les alarmes de sécurité critique relèvent
de dispositifs dédiés, régis par des normes propres (ISA-18.2, EEMUA 191), qui
imposent une signalétique forte. Ces cas sont hors du périmètre traité ici.

---

## 1. Fondement

### 1.1 La maîtrise comme finalité

La plupart des outils d'atelier se justifient par l'optimisation : réduire les
arrêts, gagner du temps. Sentinel produit ces effets, mais ils sont des moyens.
Sa finalité est la **maîtrise** : que l'atelier, et chacun de ceux qui le font
fonctionner, comprenne et pilote sa propre réalité.

L'observation de terrain le montre : les ateliers qui fonctionnent bien ne sont
pas les mieux outillés, mais ceux où les personnes comprennent ce qui se passe et
se font confiance. La maîtrise y repose sur trois conditions :

- une mémoire et un langage communs (culture opérationnelle partagée) ;
- une vision du réel sans zone d'ombre (chacun voit la même situation) ;
- une compréhension qui permet d'agir (lucidité collective).

Ces conditions rejoignent la *Situation Awareness* d'Endsley (percevoir,
comprendre, anticiper), conçue pour les opérateurs en environnement complexe, et
le *sensemaking* de Weick, qui en étend la portée au collectif. On y associe aussi
la *mastery* de Pink, qui explique pourquoi la progression motive — en gardant à
l'esprit que Pink traite de motivation sur une carrière, non de lucidité en temps
réel : c'est un appui, pas une équivalence.

### 1.2 L'outil s'efface

Pendant l'usage, l'utilisateur ne doit pas avoir conscience de Sentinel. Il
signale, il intervient, il décide ; l'interface s'efface dans l'action. C'est la
distinction de Heidegger entre l'outil *sous-la-main*, prolongement transparent
de l'intention, et l'outil qui redevient un objet encombrant lorsqu'il casse ou
gêne.

Une interface qui agresse, qui décore ou qui exhibe sa propre intelligence
contraint l'utilisateur à la regarder, au lieu de regarder sa situation. C'est le
principe de la *Calm Technology* de Weiser et Seely Brown : une technologie qui
informe sans réclamer l'attention, qui vit en périphérie et ne passe au premier
plan que lorsque c'est nécessaire.

### 1.3 Énoncé

Sentinel est un outil qui s'efface pour que l'atelier se maîtrise lui-même. Il
transforme chaque incident en occasion de lucidité partagée et d'apprentissage
collectif. Sa valeur ne tient pas au temps gagné, mais à la progression durable
des personnes et du collectif.

---

## 2. Chaîne de valeur : trois rôles à égalité

Sentinel ne privilégie aucun rôle. Il repose sur une chaîne dont chaque maillon
a une valeur équivalente ; le système n'atteint sa finalité que si les trois sont
bien servis.

| Rôle | Apport | Besoin |
|------|--------|--------|
| Opérateur | Signale : il établit la vérité à la source. | Signaler vite et juste, sans friction ni crainte de l'erreur. |
| Maintenance | Intervient et documente : il résout et nourrit la mémoire. | Comprendre vite pour bien agir ; transmettre ce qu'il apprend. |
| Responsable | Oriente : il arbitre pour le collectif. | Une visibilité complète pour décider au bon moment. |

Aucune interface n'appartient à un rôle. Le Dashboard, le Board et le Pilotage
sont utilisés par les trois, qui n'y cherchent pas la même chose (voir §4).

Cette égalité, et la responsabilisation sans crainte qu'elle suppose, rejoignent
la *Just Culture* de Dekker : un cadre où il est sûr de signaler, où l'on cherche
ce qui a mal fonctionné plutôt que qui blâmer, et qui est tourné vers la
correction plutôt que la sanction.

---

## 3. Principes

Chaque principe est une règle de décision : on doit pouvoir l'opposer à une
proposition d'interface pour l'accepter ou la refuser.

### P1 — Hiérarchie sans agression

L'information importante se distingue en premier par le contraste et la position,
non par l'intensité (saturation maximale, clignotement, surface rouge). Le stress
n'oriente pas la décision, il la dégrade.

*Appui.* Les attributs pré-attentifs décrits par Colin Ware — forme, couleur,
position, mouvement — sont perçus en moins de 500 ms, sans effort conscient :
l'attention peut être guidée sans rien exiger de l'utilisateur. La recherche en
facteurs humains montre par ailleurs que la charge de stress dégrade les tâches
de décision, celles que Sentinel sert.

*Limite.* Ce principe s'applique à l'awareness opérationnelle, pas à une alarme
de sûreté instantanée, où les normes imposent une signalétique forte qui
interrompt l'opérateur. Sentinel n'étant pas un système de sûreté temps-réel, le
calme est ici le bon choix.

> Test : cet élément attire l'œil parce qu'il est important, ou parce qu'il crie ?

### P2 — Le silence par défaut

L'état normal d'une interface est le calme. Pas de décoration, pas d'animation qui
attire l'attention sur l'interface elle-même, pas de champ affiché sans usage.
L'attention est une ressource rare, dépensée seulement pour ce qui la mérite.

*Appui.* Calm Technology (§1.2) : rester en périphérie, ne venir au premier plan
que lorsque c'est utile.

> Test : si je retire cet élément, l'utilisateur perd-il une information utile à
> sa décision ?

### P3 — Répondre à une question

Chaque écran existe pour répondre à une question précise. L'information utile vient
à l'utilisateur ; il n'a ni à la chercher ni à la reconstituer. Un écran qui
oblige à reconstruire mentalement la situation a manqué son objet.

*Appui.* Situation Awareness d'Endsley : livrer non seulement des données, mais
leur perception, leur compréhension et leur projection.

> Test : quelle est la question à laquelle cet écran répond pour ce rôle ?

### P4 — La couleur comme langage

La couleur encode un niveau d'attention, de manière constante dans toute
l'application. Un même niveau d'enjeu produit toujours le même traitement visuel ;
un traitement fort signale toujours un enjeu réel. La couleur informe, elle ne
décore pas.

*Appui.* Attributs pré-attentifs (Ware) et design d'information (Tufte) : la
cohérence perceptive permet la lecture immédiate.

> Test : ce traitement correspond-il à un niveau d'attention réel et constant
> ailleurs dans l'application ?

### P5 — De l'incident à l'apprentissage

Sentinel ne se limite pas à tracer : il capitalise. Un incident documenté
alimente une mémoire qui, à son tour, fait progresser les personnes. La base de
connaissance se conçoit comme un dispositif d'apprentissage, non comme une
archive — ce qui suppose de la distinguer du journal (§3.1).

*Appui.* Le modèle SECI de Nonaka et Takeuchi décrit la création de connaissance
comme une spirale de conversions entre savoir tacite et explicite, amplifiée de
l'individu vers le collectif. L'internalisation — le moment où une fiche consultée
modifie la façon de raisonner du lecteur — est celui où la connaissance devient
compétence.

> Test : cet incident clôturé alimente-t-il une mémoire réutilisable, ou
> disparaît-il dans un journal ?

### P6 — Responsabiliser sans punir

La traçabilité valorise la contribution et sert l'apprentissage collectif. Elle
n'est pas un instrument de surveillance. Signaler, intervenir, se tromper de bonne
foi doit rester sûr.

*Appui.* Just Culture de Dekker : sécurité psychologique, orientation vers
l'apprentissage, distinction entre l'erreur honnête et la faute, qui seule reste
imputable.

> Test : la façon de montrer « qui a fait quoi » donne-t-elle envie de contribuer,
> ou crainte d'être pris en faute ?

### P7 — Le temps comme matière

Un atelier est un système temporel. Un incident déclaré il y a une heure et un
incident en attente depuis huit jours diffèrent par nature, à situation égale par
ailleurs. L'attente, le délai de prise en charge, l'ancienneté sont des grandeurs
opérationnelles, pas des horodatages accessoires. Ce qui inquiète n'est pas qu'un
incident existe, mais qu'il dure.

Le temps doit donc être rendu sensible, et moduler le niveau d'attention de façon
progressive : un incident qui vieillit s'élève doucement dans l'échelle, sans
rupture brutale à un seuil.

*Appui.* Le niveau « projection » de la Situation Awareness (Endsley) : anticiper
où va une situation. La mécanique d'ancienneté déjà présente dans Sentinel
(« depuis X », seuil « 7 jours », délais de prise en charge) en est l'expression ;
P7 la nomme comme principe pour qu'elle soit traitée partout avec la même
intention.

> Test : le temps écoulé est-il visible et porteur de sens, ou réduit à une date
> qu'il faut aller lire et calculer ?

### 3.1 Journal et base de connaissance

Deux objets à ne pas confondre.

| | Journal | Base de connaissance |
|---|---------|----------------------|
| Nature | Trace les faits | Crée de la valeur |
| Question | Qui a fait quoi, quand ? | Comment résout-on ce problème ? Comment progresse-t-on ? |
| Usage immédiat | Mémoire, audit | Résoudre plus vite |
| Usage profond | Responsabilité, relecture | Faire évoluer la façon de raisonner |

Dans son usage le plus simple, la base de connaissance aide à résoudre un
problème plus vite. Dans son usage profond, elle modifie la manière dont les
personnes se représentent les pannes et les solutions : chaque consultation
ajuste ou crée un modèle de raisonnement. C'est la spirale — signaler, résoudre,
documenter, apprendre, mieux signaler — par laquelle le collectif progresse au
lieu de répéter.

---

## 4. Matrice interface × rôle

Pour chaque écran : la question à laquelle il répond, et ce que chaque rôle y
cherche.

### 4.1 Dashboard atelier

**Question : où en est l'atelier, et qu'attend-il de moi maintenant ?**

| Rôle | Cherche | Décide |
|------|---------|--------|
| Opérateur | Mon signalement est-il pris en compte ? Un incident existe-t-il déjà ici ? | Déclarer ou non. |
| Maintenance | Qu'est-ce qui m'attend, par quoi commencer ? | Prendre en charge, reprendre, clôturer. |
| Responsable | Qu'est-ce qui dérape, qu'est-ce qui attend mon arbitrage ? | Prioriser, trancher, instruire. |

### 4.2 Board (grand écran d'atelier)

**Question : en un regard, sans interaction, où en est-on ?**

| Rôle | Cherche | Décide |
|------|---------|--------|
| Opérateur | Mon signalement est-il visible et suivi ? | Rien — il est informé. |
| Maintenance | Qu'est-ce qui demande une présence maintenant ? | Se déplacer, organiser sa tournée. |
| Responsable | L'atelier est-il sous contrôle ou en tension ? | Mobiliser, réorganiser. |

Le Board est l'application la plus exigeante de P1 et P2 : lu de loin, en continu,
il ne doit jamais agresser.

### 4.3 Pilotage

**Question : que révèle la durée — schémas, points chauds, progrès ?**

| Rôle | Cherche | Décide |
|------|---------|--------|
| Opérateur | (accès secondaire) Les tendances qui le concernent. | — |
| Maintenance | Quelles machines reviennent ? Où porter la prévention ? | Anticiper, proposer des actions de fond. |
| Responsable | Où agir structurellement ? Le collectif progresse-t-il ? | Ressources, organisation, prévention. |

Le Pilotage sert le niveau « projection » de la Situation Awareness : il éclaire
l'avenir plutôt que le présent.

### 4.4 Historique (journal)

**Question : que s'est-il passé, et qui a contribué ?**

Sert la responsabilité (P6) et la relecture. Factuel et neutre.

### 4.5 Base de connaissance

**Question : ce problème, comment l'a-t-on déjà résolu, et qu'en apprendre ?**

Cœur de la valeur (P5). Pour l'opérateur et la maintenance : résoudre plus vite.
Pour le collectif : voir la mémoire et les compétences s'enrichir. Chaque fiche se
conçoit pour être assimilée, pas seulement lue.

---

## 5. Grammaire visuelle

Traduction des principes en règles concrètes ; cette section guide le travail
d'interface.

### 5.1 Couleur et niveaux d'attention (P1, P4)

On raisonne en niveaux d'attention, traités de façon constante dans toute
l'application.

| Niveau | Sens | Traitement |
|--------|------|-----------|
| Calme | Rien à décider | Neutre, faible contraste, l'élément s'efface. |
| À surveiller | Attention sans action immédiate | Accent doux, contraste mesuré. |
| À traiter | Action attendue | Accent affirmé mais sobre, position prioritaire dans la lecture. |
| Critique | Enjeu réel et urgent | Contraste fort par la place et la position, sans saturation extrême ni clignotement. |

L'urgent se distingue par contraste relatif au calme environnant. Un écran où tout
ressort est un écran où rien ne ressort.

### 5.2 Mouvement (P1, P2)

Le mouvement est l'attribut pré-attentif le plus puissant : il est réservé à de
rares cas et n'est jamais mis en boucle. Les transitions servent la continuité —
comprendre ce qui change — non la décoration. Le réglage `prefers-reduced-motion`
est respecté.

### 5.3 Densité (P2, P3)

Le vide met en valeur le plein ; on ne remplit pas un écran parce qu'il reste de
la place. Le Board, lu de loin, vise une densité minimale et de grands repères.
Le Pilotage, consulté de près pour l'analyse, admet une densité plus élevée.

### 5.4 États vides (P2, P3)

Un champ vide se traite avec intention : on le masque s'il n'apporte rien, ou on
le marque sobrement comme « non renseigné » lorsque l'absence est elle-même une
information (par exemple un produit en cours manquant). La structure des cartes
reste régulière pour préserver la lecture, sans bruit inutile.

### 5.5 Typographie (P3)

La hiérarchie typographique sert la compréhension : la taille reflète l'importance
dans la réponse à la question de l'écran, pas un effet esthétique. L'échelle de
tokens (`--text-*`) en est le vocabulaire.

### 5.6 Temps (P7)

Le temps s'exprime en durée vécue (« depuis 3 h », « depuis 8 j »), la date
précise restant accessible au second plan. Le vieillissement module le niveau
d'attention (§5.1) de manière continue ; le seuil « 7 jours » est un repère, pas
une alarme. Les durées sont alignées et lisibles d'un coup d'œil pour permettre la
comparaison sans calcul.

---

## 6. Usage de la doctrine

1. Avant de concevoir un écran : nommer sa question (P3) et remplir sa ligne dans
   la matrice (§4).
2. Avant de styliser un élément : lui opposer les tests P1 à P7.
3. En revue : refuser ce qui viole un principe, même séduisant ; accepter ce qui
   est sobre et juste, même modeste. Un écran qu'on ne remarque pas, mais qui a
   permis de bien voir et de bien décider, est une réussite.

---

## Références

Classées selon la solidité du lien avec la doctrine.

**Appuis directs** — le concept correspond précisément à un principe :

- Mark Weiser & John Seely Brown, *Designing Calm Technology* (Xerox PARC, 1995) ; *The Computer for the 21st Century* (1991) — §1.2, P1, P2.
- Ikujiro Nonaka & Hirotaka Takeuchi, *The Knowledge-Creating Company* (1995) — modèle SECI — P5, §3.1.
- Sidney Dekker, *Just Culture: Balancing Safety and Accountability* — P6.
- Mica Endsley, modèle de *Situation Awareness* (perception, compréhension, projection) — §1.1, P3, P7.
- Colin Ware, *Information Visualization: Perception for Design* (attributs pré-attentifs) — P1, P4.

**Analogies assumées** — rapprochements proposés, avec leurs limites :

- Karl E. Weick, *Sensemaking in Organizations* (1995) — extension de la maîtrise au collectif.
- Daniel Pink, *Drive* (2009) — motivation par la maîtrise (registre long terme, non opérationnel).
- Edward Tufte — design d'information (clarté, sobriété).
- Martin Heidegger — *Zuhandenheit / Vorhandenheit* — métaphore de l'outil sous-la-main (§1.2).

**Hors périmètre, cités pour situer la limite :**

- ISA-18.2, EEMUA 191 — normes de gestion d'alarmes industrielles (sûreté critique), qui délimitent ce que Sentinel ne traite pas (Périmètre, P1).
