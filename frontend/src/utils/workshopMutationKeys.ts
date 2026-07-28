/**
 * Identifiants stables du contrat de mutation Atelier.
 *
 * Le verrou est global : les clés servent à exposer le pending sur la bonne
 * surface et à replacer le focus près de l'action qui vient d'échouer.
 */
export const WORKSHOP_MUTATION_KEYS = {
  CREATE: 'workshop:create',
  EDIT: 'workshop:edit',
  REQUEST_EDIT: 'workshop:request-edit',
  WITHDRAW_EDIT: 'workshop:withdraw-edit',
  TAKE_CHARGE: 'workshop:take-charge',
  SET_PENDING: 'workshop:set-pending',
  RESUME: 'workshop:resume',
  CLOSE: 'workshop:close',
  INVALIDATE: 'workshop:invalidate',
  PRIORITY: 'workshop:priority',
  FOLLOW: 'workshop:follow',
  RESPONSIBLE_COMMENT: 'workshop:responsible-comment',
  DELETE_RESPONSIBLE_COMMENT: 'workshop:delete-responsible-comment',
  REQUEST_CANCEL: 'workshop:request-cancel',
  WITHDRAW_CANCEL: 'workshop:withdraw-cancel',
  CONSULT_ARBITRATION: 'workshop:consult-arbitration',
  APPLY_EDIT: 'workshop:apply-edit',
  REJECT_EDIT: 'workshop:reject-edit',
  APPROVE_CANCEL: 'workshop:approve-cancel',
  REJECT_CANCEL: 'workshop:reject-cancel',
  DIRECT_CANCEL: 'workshop:direct-cancel',
} as const;
