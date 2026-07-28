# RC4 — Inventaire des mutations frontend

## Portée et méthode

Cet inventaire a été créé au lot 0 puis actualisé au lot 4. Il a été produit par balayage des
imports de `frontend/src/api/*`, de tous leurs appels dans le code frontend de
production, des soumissions de formulaires, des écritures de stockage navigateur
et des tests existants. Pour les lignes Atelier passées à `COVERED`, la colonne
**Tests** désigne des preuves effectivement exécutées au lot 4.

Ne sont pas des mutations métier et ne reçoivent donc pas de ligne :

- les chargements `GET` ;
- `checkBadgeAvailability`, `getAccountImpact` et `getLineImpact`, qui préparent
  une décision sans modifier l'état ;
- `checkLineConflicts`, malgré son verbe HTTP `POST`, car ce service ne fait
  qu'un contrôle de disponibilité ;
- `verifyAdminPassword`, qui est une étape de réauthentification préalable aux
  mutations critiques et non leur résultat métier ;
- `getOrCreateSessionScreenId`, qui initialise techniquement dans
  `sessionStorage` un identifiant d'écran Board au chargement et n'est ni une
  action explicite de l'utilisateur ni une mutation métier.

Les états employés sont :

- `COVERED` : le contrat cinq états, l'anti-double, le feedback accessible et la
  récupération attendue sont branchés sur l'infrastructure partagée et prouvés ;
- `PARTIAL` : une partie substantielle du contrat cinq états existe, mais une
  preuve ciblée ou un élément du contrat manque ;
- `GAP` : une exigence observable est absente ou contredite par le comportement
  actuel ;
- `EXCEPTION_TO_REVIEW` : le comportement peut relever d'une exception prévue
  par la section 8.1, mais l'exception reste à documenter et à prouver.

Abréviations des preuves existantes :

- `UT-CI` : `frontend/src/components/__tests__/CreateIncidentModal.test.tsx` ;
- `UT-IA` : `frontend/src/hooks/__tests__/useIncidentActions.feedback.test.tsx` ;
- `UT-IDP` : `frontend/src/components/__tests__/IncidentDetailPanel.test.tsx` ;
- `UT-RIR` : `frontend/src/components/__tests__/ReviewIncidentRequestModal.test.tsx` ;
- `UT-CM` : `frontend/src/components/__tests__/ConfirmModal.test.tsx` ;
- `UT-MF` : `frontend/src/components/ui/__tests__/MutationFeedback.test.tsx` ;
- `UT-ARCH` : `frontend/src/components/__tests__/WorkshopMutationArchitecture.test.ts` ;
- `UT-TEXT` : `frontend/src/components/__tests__/WorkshopTextMutationContract.test.tsx` ;
- `UT-CU` : `frontend/src/components/__tests__/CreateUserModal.test.tsx` ;
- `UT-DU` : `frontend/src/components/__tests__/DeleteConfirmModal.test.tsx` ;
- `UT-EM` : `frontend/src/components/__tests__/EditMachineModal.test.tsx` ;
- `UT-SC` : `frontend/src/components/__tests__/SupportChat.test.tsx` ;
- `E2E-LIFE` : `frontend/e2e/incident-lifecycle.spec.ts` ;
- `E2E-CANCEL` : `frontend/e2e/workshop-cancel-withdrawal.spec.ts` ;
- `E2E-ARB` : `frontend/e2e/workshop-arbitration-mobile.spec.ts` ;
- `E2E-MUT` : `frontend/e2e/workshop-mutation-feedback.spec.ts` ;
- `E2E-USERS` : `frontend/e2e/admin-users.spec.ts` ;
- `E2E-MACHINE` : `frontend/e2e/edit-machine.spec.ts` ;
- `E2E-BOARD` : `frontend/e2e/board.spec.ts` ;
- `E2E-SEC` : `frontend/e2e/security-contracts.spec.ts`.

## Atelier

| Surface | Déclencheur | API/service | Destructive ? | Confirmation | Pending | Succès | Échec | Focus/récupération | Tests | État |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Atelier | Créer un incident — `CreateIncidentModal`, « Valider la création » | `createWorkshopIncident` — `POST /api/workshop/incidents` | Non | Aperçu puis bouton final explicite | Clé partagée, commandes désactivées et `aria-busy` ; double activation = un appel | `Incident signalé.` | Erreur publique sûre ; modale et saisies byte-identiques | Réessai possible ; focus d'erreur puis restauration du déclencheur à la fermeture | `UT-CI`, `UT-MF`, `E2E-LIFE`, `E2E-MUT` | `COVERED` |
| Atelier | Modifier directement un incident — `IncidentDetailPanel` → `CreateIncidentModal` | `updateWorkshopIncident` — `PATCH /api/workshop/incidents/:id` | Non | Aperçu avant envoi | Même runner partagé et verrou global | `Modification appliquée.` | Modale et valeurs conservées | Réessai et retour au déclencheur | `UT-CI`, `UT-ARCH` | `COVERED` |
| Atelier | Proposer une correction — même modale avec `requestOnly=true` | Même `PATCH` | Non | Aperçu avant envoi | Même runner partagé et verrou global | `Demande de correction envoyée.` | Modale et valeurs conservées | Réessai et focus d'erreur | `UT-CI`, `E2E-MUT` | `COVERED` |
| Atelier | Retirer une demande de correction — panneau | `updateWorkshopIncident({ withdrawEditRequest: true })` | Non | Aucune, retrait réversible | Clé partagée, action désactivée, un appel | `Demande de correction retirée.` | Erreur sûre, panneau maintenu | Action refocalisée et réutilisable | `UT-IDP`, `E2E-MUT` | `COVERED` |
| Atelier | Prendre en charge — `TakeChargeConfirmModal` | `updateWorkshopIncident({ isTaken: true })` | Non | Confirmation explicite | Runner partagé, `aria-busy`, un appel | `Prise en charge enregistrée.` | Confirmation maintenue | Réessai ; restauration du déclencheur | `UT-IA`, `UT-CM`, `E2E-LIFE` | `COVERED` |
| Atelier | Mettre en attente — `PendingConfirmModal` | `updateWorkshopIncident({ status: "PENDING", waitingReason })` | Non | Motif obligatoire | Runner partagé, commandes désactivées, `aria-busy` | `Incident mis en attente.` | Erreur sûre, motif byte-identique | Focus restauré au motif, réessai réel | `UT-TEXT`, `UT-IA`, `E2E-LIFE` | `COVERED` |
| Atelier | Reprendre — `ResumeIncidentConfirmModal` | `updateWorkshopIncident({ status: "OPEN" })` | Non | Confirmation explicite | Runner partagé, `aria-busy`, un appel | `Traitement repris.` | Confirmation maintenue | Réessai ; restauration du déclencheur | `UT-IA`, `UT-CM`, `E2E-LIFE` | `COVERED` |
| Atelier | Clôturer — `CloseIncidentModal` | `updateWorkshopIncident({ status: "CLOSED", interventionNote })` | Oui, état final | Conséquence définitive et historique explicités, compte rendu obligatoire | Runner partagé, `aria-busy`, un appel | `Incident clôturé et conservé dans l’historique.` | Compte rendu byte-identique, modale maintenue | Focus au champ ; annulation et succès restaurent le déclencheur | `UT-TEXT`, `UT-CM`, `E2E-LIFE` | `COVERED` |
| Atelier | Invalider — `InvalidateIncidentModal` | `updateWorkshopIncident({ status: "INVALIDATED", invalidationReason })` | Oui | Conséquence définitive et historique explicités | Runner partagé, `aria-busy`, un appel | `Incident invalidé et conservé dans l’historique.` | Motif byte-identique, modale maintenue | Focus au champ ; restauration du déclencheur | `UT-TEXT`, `UT-CM` | `COVERED` |
| Atelier | Déclarer l'urgence | `updateWorkshopIncident({ isPriority: true })` | Non | Aucune requise | Clé partagée, action désactivée, un appel | `Incident déclaré urgent.` | Erreur sûre, action réutilisable | Focus conservé/restauré | `UT-IA`, `UT-IDP`, `E2E-MUT` | `COVERED` |
| Atelier | Retirer l'urgence | `updateWorkshopIncident({ isPriority: false })` | Non | Aucune requise | Même contrat partagé | `Urgence retirée.` | Erreur sûre, action réutilisable | Focus conservé/restauré | `UT-IA`, `UT-IDP` | `COVERED` |
| Atelier | Suivre un incident — carte ou panneau | `followWorkshopIncident` — `POST /follow` | Non | Aucune requise | Clé partagée entre carte et panneau, un appel | `Suivi activé.` | Erreur sûre, aucun état optimiste mensonger | Focus conservé/restauré | `UT-IA`, `UT-IDP`, `E2E-MUT` | `COVERED` |
| Atelier | Ne plus suivre un incident actif — carte ou panneau | `unfollowWorkshopIncident` — `DELETE /follow` | Non | Aucune requise | Même contrat partagé | `Suivi désactivé.` | Erreur sûre, action réutilisable | Focus conservé/restauré | `UT-IA`, `UT-IDP` | `COVERED` |
| Atelier | Ne plus suivre un incident résolu — `UnfollowIncidentConfirmModal` | Même `DELETE /follow` | Non | Confirmation dédiée | Runner partagé, `aria-busy`, un appel | `Suivi désactivé.` | Confirmation maintenue | Réessai et restauration du déclencheur | `UT-IA`, `UT-CM` | `COVERED` |
| Atelier | Ajouter ou modifier une consigne — panneau | `updateWorkshopIncident({ responsibleComment })` | Non | Aucune requise | Runner partagé, commandes désactivées | `Consigne enregistrée.` | Texte byte-identique, panneau maintenu | Focus au champ et réessai | `UT-IDP`, `E2E-MUT` | `COVERED` |
| Atelier | Retirer une consigne — confirmation dédiée | `updateWorkshopIncident({ responsibleComment: "" })` | Oui, retrait de contenu | Conséquence explicite | Runner partagé, `aria-busy`, un appel | `Consigne retirée.` | Confirmation maintenue | Réessai ; restauration du déclencheur | `UT-IA`, `UT-CM`, `E2E-MUT` | `COVERED` |
| Atelier | Demander une annulation — `DeleteRequestModal` | `updateWorkshopIncident({ cancelRequest: true, cancelRequestReason })` | Non | Motif obligatoire | Runner partagé, `aria-busy`, un appel | `Demande d’annulation envoyée.` | Motif byte-identique, modale maintenue | Focus au motif et réessai | `UT-TEXT`, `UT-IA`, `E2E-MUT` | `COVERED` |
| Atelier | Retirer une demande d'annulation — panneau | `updateWorkshopIncident({ withdrawCancelRequest: true })` | Non | Aucune, retrait réversible | Clé partagée, action désactivée, un appel | `Demande d’annulation retirée.` | Erreur sûre, dossier maintenu | Action réutilisable et refocalisée | `UT-IDP`, `E2E-CANCEL`, `E2E-MUT` | `COVERED` |
| Atelier | Accuser la consultation d'un arbitrage | `consultWorkshopArbitration` — `POST /arbitration-consultation` | Non | Aucune requise | Runner partagé, modale `aria-busy`, un appel | `Dossier d’arbitrage consulté.` | Erreur locale sûre, modale maintenue | Réessai possible | `UT-RIR`, `UT-ARCH`, `E2E-ARB` | `COVERED` |
| Atelier | Appliquer une correction — arbitrage responsable | `updateWorkshopIncident({ applyEditRequest: true })` | Oui, décision définitive | Décision explicite dans la modale | Runner partagé, commandes désactivées, `aria-busy` | `Modification appliquée.` | Erreur sûre, modale maintenue | Réessai ; restauration au dossier | `UT-IA`, `UT-RIR`, `E2E-ARB` | `COVERED` |
| Atelier | Refuser une correction — formulaire de motif | `updateWorkshopIncident({ rejectEditRequest: true, decisionReason })` | Oui, décision définitive | Motif obligatoire et libellé final | Runner partagé, commandes désactivées, un appel | `Demande de modification refusée.` | Huit détails techniques filtrés ; motif byte-identique | Focus au motif et réessai réel | `UT-IA`, `UT-RIR`, `E2E-MUT` | `COVERED` |
| Atelier | Confirmer une demande d'annulation | `cancelWorkshopIncident({ expectArbitration: true })` — `POST /cancel` | Oui | Conséquence définitive et historique explicités | Runner partagé, commandes désactivées, un appel | `Incident annulé et conservé dans l’historique.` | Erreur sûre, modale maintenue | Réessai ; restauration au dossier | `UT-IA`, `UT-RIR`, `E2E-MUT` | `COVERED` |
| Atelier | Refuser une demande d'annulation — formulaire de motif | `updateWorkshopIncident({ rejectDeleteRequest: true, decisionReason })` | Oui, décision définitive | Motif obligatoire et libellé final | Runner partagé, commandes désactivées, un appel | `Demande d’annulation refusée.` | Motif byte-identique, erreur sûre | Focus au motif et réessai | `UT-IA`, `UT-RIR` | `COVERED` |
| Atelier | Annuler directement côté maintenance/responsable | `cancelWorkshopIncident({ expectArbitration: false })` — `POST /cancel` | Oui | Conséquence définitive et historique explicités | Runner partagé, `aria-busy`, un appel | `Incident annulé et conservé dans l’historique.` | Erreur sûre, confirmation maintenue | Réessai et restauration du déclencheur | `UT-IA`, `UT-CM` | `COVERED` |

## Administration

| Surface | Déclencheur | API/service | Destructive ? | Confirmation | Pending | Succès | Échec | Focus/récupération | Tests | État |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Administration | Créer un compte — `CreateUserModal` | `createAccount` — `POST /api/admin/accounts` | Non | Aperçu puis « Confirmer la création » | `loading`, boutons désactivés, spinner et modale `aria-busy` | Écran `role="status"` avec code temporaire, puis bannière de liste après fermeture | Erreurs locales sûres ; formulaire conservé | Modale maintenue ; retour au bouton après fermeture | `UT-CU` succès et validation ; `E2E-USERS` succès et badge dupliqué | `PARTIAL` |
| Administration | Modifier identité, badge, rôle ou email d'un compte — `EditUserModal` → `EditSummaryModal` | `updateAccount` — `PATCH /api/admin/accounts/:id` | Non | Récapitulatif avant/après | `loading`, commandes désactivées et modale `aria-busy` | Bannière `Utilisateur mis à jour avec succès.` après fermeture | Erreur locale sûre, récapitulatif maintenu | Retour au déclencheur par `Modal` | Aucun test de mutation ciblé | `PARTIAL` |
| Administration | Activer un compte — changement de statut dans le même récapitulatif | `activateAccount` — `PATCH /activate` | Non | Récapitulatif avant/après | Même pending que l'édition | Même bannière générique | Erreur locale ; si combiné à une édition déjà réussie, l'échec du second appel laisse un état serveur partiellement modifié | Modale maintenue mais modèle local potentiellement périmé après échec partiel | Aucun test ciblé | `PARTIAL` |
| Administration | Désactiver un compte — changement de statut dans le même récapitulatif | `deactivateAccount` — `PATCH /deactivate` | Oui ; peut révoquer l'accès | Récapitulatif, sans avertissement spécifique sur la perte d'accès | Même pending que l'édition | Même bannière générique | Même risque non atomique si d'autres champs sont enregistrés avant la désactivation | Réessai possible, mais état serveur potentiellement partiel | Aucun test ciblé | `GAP` |
| Administration | Réinitialiser le mot de passe d'un compte — `ResetPasswordConfirmModal` | `resetAccountPassword` — `PATCH /reset-password` | Oui, invalide le secret ou code précédent | Confirmation danger si un secret existe | `loading`, `ConfirmModal`, commandes désactivées et `aria-busy` | Écran `role="status"` avec nouveau code temporaire | Erreur sûre, modale maintenue, bouton réactivé | Mot de passe sans saisie métier ; retour au déclencheur après fermeture | Aucun test ciblé | `PARTIAL` |
| Administration | Supprimer un compte — `DeleteConfirmModal` | `deleteAccount` — `DELETE /api/admin/accounts/:id` après réauthentification | Oui | Modale danger, impact chargé et mot de passe admin | Double verrou du `ConfirmModal` et de `AdminPasswordConfirmModal`, `aria-busy` | Navigation vers la liste, **sans message de succès** | Erreur sûre, modale et mot de passe conservés ; suppression bloquée si prise en charge active | Réessai possible ; navigation supprime le déclencheur | `UT-DU` succès, erreur et réauthentification ; pas d'E2E | `GAP` |
| Administration | Créer une ligne — `CreateLineModal` | `createLine` — `POST /api/admin/lines` | Non | Aperçu puis « Confirmer la création » | `loading`, commandes désactivées, spinner et modale `aria-busy` | Bannière `Ligne … créée avec succès.` après fermeture | Erreur sûre, formulaire conservé | Retour au déclencheur par `Modal` | Aucun test de mutation ciblé | `PARTIAL` |
| Administration | Modifier numéro ou structure d'une ligne — `EditLineModal` → `EditLineSummaryModal` | `updateLine` — `PATCH /api/admin/lines/:id` | Potentiellement, structure référentielle | Récapitulatif avant/après | `loading`, commandes désactivées et modale `aria-busy` | Bannière `Ligne … modifiée avec succès.` | Erreur locale sûre, récapitulatif conservé | Retour au déclencheur par `Modal` | `E2E-MACHINE` ne couvre que le refus indirect d'une structure liée ; aucun test de ce formulaire | `PARTIAL` |
| Administration | Activer une ligne — statut dans `EditLineSummaryModal` | Même `PATCH /api/admin/lines/:id` | Non | Récapitulatif avant/après | Même pending que l'édition | Même bannière de modification | Erreur locale, saisie conservée | Réessai possible | Aucun test ciblé | `PARTIAL` |
| Administration | Désactiver une ligne — statut dans `EditLineSummaryModal` | Même `PATCH /api/admin/lines/:id` | Oui, retrait de la gestion active | Récapitulatif avant/après, sans avertissement dédié | Même pending que l'édition | Même bannière de modification | Erreur locale, saisie conservée | Réessai possible | Aucun test ciblé | `PARTIAL` |
| Administration | Modifier une machine — `EditMachineModal` | `updateLine({ machines })` — `PATCH /api/admin/lines/:id` | Potentiellement, référentiel lié aux incidents | Aperçu avant/après | `loading`, commandes désactivées, spinner et `aria-busy` ; pas de verrou `ref` | Bannière `Machine modifiée avec succès.` | Erreur sûre et modale maintenue ; conflit métier affiché | Valeurs conservées, réessai possible | `UT-EM` absence de changement et succès ; `E2E-MACHINE` succès et conflit actif | `PARTIAL` |
| Administration | Réordonner le plan d'une ligne — `LinePlanModal` | `updateLine({ machines })` — `PATCH /api/admin/lines/:id` | Potentiellement, ordre référentiel | Aperçu avant/après | `loading`, commandes désactivées et `aria-busy` | Bannière `Ordre des machines mis à jour.` | Erreur locale, ordre brouillon conservé | Réessai possible | Aucun test ciblé | `PARTIAL` |
| Administration | Archiver une ligne sans incident actif — `ArchiveLineConfirmModal` | `archiveLine(force=false)` — `POST /api/admin/lines/:id/archive` | Oui | Confirmation danger et mot de passe admin | Pending imbriqué | Bannière `Ligne … archivée avec succès.` après fermeture | **Blocage** : l'erreur est absorbée par la modale interne ; le wrapper de réauthentification croit au succès et reste en chargement, sans réessai possible | Modale figée sur erreur | Aucun test ciblé | `GAP` |
| Administration | Archivage forcé avec annulation des incidents actifs — mode forcé de `ArchiveLineConfirmModal` | `archiveLine(force=true)` — même endpoint | Oui, annulations définitives en lot | Deuxième état danger, nombre d'incidents, mot de passe admin | Même pending imbriqué | Même bannière d'archivage | Même blocage en chargement sur erreur ; les tests négatifs et de double soumission manquent | Modale figée sur erreur | Aucun test ciblé | `GAP` |
| Administration | Modifier une préférence de notification — interrupteurs `AdminSettingsPage` | `patchAdminNotifPrefs` — `PATCH /api/admin/settings/notifications` | Non | Aucune requise | Sauvegarde optimiste, verrou `savingPrefRef`, tous les interrupteurs désactivés ; pas d'`aria-busy` | **Aucun message de succès** | Rollback visuel et erreur persistante | Interrupteur réactivé ; pas de focus explicite | Aucun test ciblé | `GAP` |
| Administration | Activer le Board — `BoardToggleConfirmModal` | `patchBoardEnabled(true, password)` — `PATCH /api/admin/settings/board/toggle` | Non | Confirmation avec mot de passe | Modale `aria-busy`, commandes désactivées, verrou du socle | État de l'interrupteur mis à jour, **sans message de succès** | Erreur sûre, modale et mot de passe maintenus | Réessai possible | Aucun test ciblé | `GAP` |
| Administration | Désactiver le Board — `BoardToggleConfirmModal` | `patchBoardEnabled(false, password)` — même endpoint | Oui, révoque toutes les sessions Board | Confirmation explicite, avertissement et mot de passe | Même pending que l'activation | État de l'interrupteur mis à jour, **sans message de succès** | Erreur sûre, modale maintenue | Réessai possible | Aucun test ciblé | `GAP` |
| Administration | Changer le code Board — formulaire `AdminSettingsPage` | `patchBoardCode` — `PATCH /api/admin/settings/board/code` | Oui, révoque toutes les sessions Board | Avertissement inline et mot de passe, mais **pas de confirmation dédiée** | `boardSubmitting`, champs et bouton désactivés, spinner ; pas d'`aria-busy` ni verrou `ref` | `Code mis à jour. Sessions révoquées.` dans un `role="status"` temporaire | Erreur sûre, champs conservés | Formulaire réutilisable ; aucun focus d'erreur explicite | Aucun test ciblé | `GAP` |
| Administration | Modifier la durée ou le mode sans expiration de session Board — formulaire Comportement | `patchAppSettings({ board_session_ttl_hours })` | Non pour les sessions existantes | Aucune ; le texte précise l'application aux nouvelles sessions | `appSettingsSaving`, commandes désactivées et spinner ; pas d'`aria-busy` ni verrou `ref` | `Paramètres enregistrés.` dans un `role="status"` temporaire | Erreur traduite, brouillon conservé, focus vers le champ si `details.field` est reconnu | Annulation restaure le dernier état serveur | Aucun test ciblé | `PARTIAL` |
| Administration | Modifier les paramètres applicatifs — durées Admin/Atelier, tentatives, validité du code, libellé Board | `patchAppSettings` — `PATCH /api/admin/settings/app` | Non pour les sessions existantes | Aucune requise selon le texte de surface | Même pending que la durée Board | `Paramètres enregistrés.` | Erreur traduite, brouillon conservé, focus de champ mappé | Réessai possible | Aucun test ciblé | `PARTIAL` |
| Administration | Changer le mot de passe administrateur — formulaire Sécurité | `changeAdminPassword` — `PATCH /api/admin/security/password`, puis logout | Oui, invalide la session courante | Saisie de l'ancien, du nouveau et confirmation, mais pas de modale séparée | `pwdLoading`, champs et bouton désactivés, spinner ; pas d'`aria-busy` ni verrou `ref` | Déconnexion et navigation avec `Mot de passe modifié. Reconnectez-vous.` | Erreur sûre, champs conservés | Navigation sert de succès ; réessai sur place en échec | Aucun test ciblé | `PARTIAL` |
| Administration | Ajouter, changer ou retirer l'adresse de courriel admin — formulaire Sécurité | `updateAdminEmail` — `PATCH /api/admin/security/email` | Potentiellement, canal de récupération | Ancien email et mot de passe requis ; pas de confirmation séparée | `emailLoading`, champs et bouton désactivés, spinner ; pas d'`aria-busy` ni verrou `ref` | `Email mis à jour.` dans un `role="status"` temporaire, formulaire vidé | Erreur sûre, champs conservés si la mutation ou le rechargement échoue | Réessai possible ; pas de focus explicite | Aucun test ciblé | `PARTIAL` |
| Administration | Révoquer les sessions Admin, Atelier et/ou Board — cases puis `RevokeSessionsConfirmModal` | `patchAppSettings({ revoke*Sessions, currentPassword })` | Oui | Modale danger, scopes listés et mot de passe | La modale possède un pending, mais l'appelant la ferme **avant** l'appel API | Message de succès pour Atelier/Board ; navigation pour Admin | Erreur affichée dans le formulaire sous-jacent ; brouillon gardé mais modale fermée et mot de passe perdu | Violation directe « une erreur ne ferme jamais la modale » ; nouvel essai complet requis | Aucun test ciblé | `GAP` |
| Administration | Marquer une demande de réinitialisation comme traitée — `PendingTasksWidget` | `markPasswordResetRequestHandled` — `PATCH /api/admin/password-reset-requests/:id/handle` | Oui, retire la tâche de la liste | Confirmation expliquant le prérequis de communication | `loading` + `ConfirmModal`, commandes désactivées et `aria-busy` | La tâche disparaît, **sans message de succès** | Erreur sûre du socle, modale maintenue, bouton réactivé | Réessai possible | `UT-CM` socle uniquement | `GAP` |

## Authentification et Board

| Surface | Déclencheur | API/service | Destructive ? | Confirmation | Pending | Succès | Échec | Focus/récupération | Tests | État |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Authentification Admin | Continuer puis se connecter — `AdminLoginPage` | `unifiedLogin` — `POST /api/auth/login` (sonde d'identifiant puis mot de passe) | Non | Aucune requise | `loading`, champs et bouton désactivés, spinner ; pas d'`aria-busy` ni verrou `ref` | Création de session puis navigation vers l'accueil | Erreur sûre, identifiant et mot de passe conservés | Autofocus lors du passage au mot de passe ; navigation comme preuve de succès | `E2E-USERS` et autres helpers couvrent le succès ; `E2E-SEC` couvre le rejet du namespace numérique, pas le cycle d'erreur réseau | `EXCEPTION_TO_REVIEW` |
| Authentification Atelier | Continuer puis se connecter — `WorkshopLoginPage` | Même `POST /api/auth/login` | Non | Aucune requise | Même pending que l'Admin | Création de session puis navigation vers le dashboard | Erreur/avertissement sûrs, saisies conservées | Autofocus par étape ; navigation comme preuve de succès | Helpers E2E nombreux sur le succès ; pas de test ciblé réseau/double/focus | `EXCEPTION_TO_REVIEW` |
| Authentification Atelier | Première connexion, définir le mot de passe — mode `setup` | `unifiedLogin(identifier, newPassword, setupCode)` | Oui, consomme le code et crée un secret | Code, nouveau mot de passe et confirmation | `loading`, champs désactivés et spinner ; pas d'`aria-busy` ni verrou `ref` | Session créée puis navigation | Erreur sûre, code et mots de passe conservés | Autofocus sur le code ; navigation comme preuve de succès | Aucun test ciblé | `EXCEPTION_TO_REVIEW` |
| Authentification Admin | Déconnexion — `NavBar` | `unifiedLogout` — `POST /api/auth/logout` | Oui, termine la session | Aucune, exception login/logout prévue | Aucun pending, aucun verrou ; double clic possible | API en meilleur effort, session locale vidée, navigation vers `/login` | Erreur API volontairement absorbée | Navigation comme preuve de résultat ; pas de réessai visible | Utilisé par les parcours E2E, aucun test d'interaction ciblé | `EXCEPTION_TO_REVIEW` |
| Authentification Atelier | Déconnexion — `WorkshopNavBar` | Même `POST /api/auth/logout` | Oui | Aucune, exception login/logout prévue | Aucun pending, aucun verrou | Session locale vidée et navigation | Erreur API absorbée | Navigation comme preuve de résultat | Aucun test ciblé | `EXCEPTION_TO_REVIEW` |
| Authentification Atelier | Demander une réinitialisation — `ConfirmModal` « Envoyer la demande » | `requestPasswordReset` — `POST /api/auth/password-reset/request` | Non | Confirmation dédiée | `loading` + verrou du `ConfirmModal`, modale `aria-busy` | Affiche `Demande envoyée…` | **Le `finally` ferme la modale et affiche le succès même si l'API échoue** ; l'erreur du socle ne peut plus rester dans la modale | Saisie d'identifiant conservée, mais réessai masqué par le faux succès | Aucun test ciblé | `GAP` |
| Board | Connexion Board — `BoardAccessPage` | `createBoardSession` — `POST /api/board/session` | Non | Aucune requise | `loading`, champ et bouton désactivés, spinner ; pas d'`aria-busy` ni verrou `ref` | Champ vidé puis tableau affiché | Erreur sûre et code conservé | Autofocus initial ; changement d'écran comme preuve de succès | `E2E-BOARD` erreur métier, succès et persistance | `EXCEPTION_TO_REVIEW` |
| Board | Quitter le Board — `WorkshopBoardPage`, « Quitter » | `logoutBoardSession` — `POST /api/board/logout` | Oui, termine la session Board | Aucune, exception logout potentielle | Aucun pending, aucun verrou | API en meilleur effort puis navigation | Erreur absorbée | Navigation comme preuve de résultat | Aucun test ciblé | `EXCEPTION_TO_REVIEW` |
| Authentification Admin/Atelier | Révocation ou expiration détectée sur une réponse `401` — `AppAuthContext.markExpired` | `unifiedLogout` en meilleur effort + session locale vidée | Système, pas une mutation utilisateur | Sans objet | Verrou `redirectingRef` contre les redirections multiples | Navigation vers `/login` et motif stocké puis affiché | Le logout d'assainissement absorbe son erreur | Motif visible après navigation ; interaction utilisateur sans objet | `E2E-SEC` prouve la révocation serveur au cinquième échec, pas le message UI après révocation | `EXCEPTION_TO_REVIEW` |
| Board | Révocation/expiration détectée au rafraîchissement — `WorkshopBoardPage.refreshBoard` | `getBoardData` reçoit `401`, puis `logoutBoardSession` | Système, pas une mutation utilisateur | Sans objet | Un seul rafraîchissement via `refreshControllerRef` | Navigation avec `Session board expirée ou révoquée.` | Erreur de logout absorbée | Motif transmis à la navigation | Aucun test ciblé d'ancienne session révoquée | `EXCEPTION_TO_REVIEW` |
| Board | Enregistrer les paramètres d'affichage locaux — `WorkshopBoardPage`, « Paramètres d'affichage » | `saveBoardSettings` — `localStorage.setItem` par écran | Non, local au navigateur | Aucune requise | Opération synchrone, aucun pending | Fermeture de la modale et application immédiate, sans zone de statut | Erreur locale, modale maintenue et brouillon conservé | Réessai possible ; focus restauré à la fermeture | `E2E-BOARD` vérifie seulement la présence du bouton Réglages | `EXCEPTION_TO_REVIEW` |

## Support

| Surface | Déclencheur | API/service | Destructive ? | Confirmation | Pending | Succès | Échec | Focus/récupération | Tests | État |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Support Admin | Envoyer un message — `AdminSupportPage` → `SupportChat` | `sendAdminSupportMessage` — `POST /api/admin/support/chat` | Non | Aucune requise | `loading`, compositeur désactivé, indicateur de réponse et garde anti-double ; pas d'`aria-busy` | Réponse ajoutée au journal `aria-live="polite"` | Erreur sûre persistante, mais **la saisie a déjà été vidée et n'est pas restaurée** | Textarea refocalisée, mais l'utilisateur doit ressaisir son message | `UT-SC` succès, anti-double, erreur sûre et abort ; aucun test spécifique à l'endpoint Admin | `GAP` |
| Support Atelier | Envoyer un message — `WorkshopSupportPage` → `SupportChat` | `sendWorkshopSupportMessage` — `POST /api/workshop/support/chat` | Non | Aucune requise | Même gestion partagée | Même réponse dans le journal vivant | Même perte de saisie sur erreur | Même refocus sans restauration du texte | `UT-SC` sur le composant partagé ; aucun test spécifique à l'endpoint Atelier | `GAP` |

## Synthèse

L'inventaire contient **61 mutations ou réactions mutantes** :

- 24 lignes Atelier ;
- 24 lignes Administration ;
- 11 lignes Authentification/Board ;
- 2 lignes Support.

Répartition initiale au lot 0 :

- 34 `PARTIAL` ;
- 16 `GAP` ;
- 11 `EXCEPTION_TO_REVIEW`.

Après le lot 4, sans reclasser les surfaces réservées au lot 5 :

- 24 `COVERED` — toutes les lignes Atelier ;
- 14 `PARTIAL` ;
- 13 `GAP` ;
- 10 `EXCEPTION_TO_REVIEW`.

Le contrat partagé est désormais consommé en production par les quatre points
d'orchestration Atelier (`CreateIncidentModal`, `useIncidentActions`,
`IncidentDetailPanel`, `WorkshopDashboardPage`) et observé par les confirmations
communes. Il centralise le verrou anti-double synchrone, le pending par clé, les
succès accessibles, les erreurs publiques sûres, le refocus et la protection des
callbacks après démontage. Les états locaux `runSimple`, `runPanelAction`,
`reviewActionRef`, `pendingActionRef` et `reviewLoading` ont disparu du périmètre
Atelier. Le `submittingRef` restant dans la branche de compatibilité de
`ConfirmModal` ne sert qu'aux consommateurs non-Atelier, réservés au lot 5.

Les lacunes transversales restant à traiter sont :

1. les mutations Administration, Authentification/Board et Support restent au
   lot 5 et conservent leurs classements `PARTIAL`, `GAP` ou exception ;
2. les préférences de notification, les bascules Board et le traitement d'une
   demande de reset n'annoncent pas leur succès ;
3. l'archivage de ligne reste bloqué en chargement sur erreur ;
4. la révocation de sessions ferme sa modale avant le résultat ;
5. la demande de réinitialisation Atelier affiche un faux succès même en cas
   d'échec ;
6. le support efface la saisie avant l'appel et ne la restaure pas après échec ;
7. les exceptions de navigation login/logout et de stockage local Board restent
   à formaliser et à tester ;
8. R4-09 reste ouvert pour les parcours navigateur hors matrice Atelier du lot 4.
