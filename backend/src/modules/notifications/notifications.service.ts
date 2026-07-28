import pool from '../../db/pool';
import logger from '../../logger';
import { getAdminEmail, getMailer, getSenderAddress } from './mailer';
import { getAdminNotifPref } from '../adminCredentials/adminCredentials.repository';
import * as adminResetTemplate from './templates/admin-password-reset-requested';
import * as actionRequiredTemplate from './templates/responsable-action-required';
import * as incidentUpdateTemplate from './templates/incident-update';
import { htmlToText } from './templates/layout';

// ─── Résultat de livraison ─────────────────────────────────────────────────────
//
// Un envoi SMTP réussi n'est pas la seule issue légitime : la préférence peut
// être désactivée, ou aucun destinataire actif ne peut être résolu. Ces deux
// cas ne sont pas des échecs — mais ce ne sont pas non plus des succès d'envoi.
// L'outbox a besoin de cette distinction pour ne jamais les confondre (DR-14).
export type DeliveryOutcome = 'SENT' | 'SKIPPED_DISABLED' | 'SKIPPED_NO_RECIPIENT';

// `delivered` porte les adresses confirmées à cette tentative — jamais
// recalculées, jamais renvoyées lors d'une reprise (DR-13). `alreadyDelivered`
// permet à l'appelant d'exclure les adresses déjà confirmées par une tentative
// précédente du même canal, pour qu'un échec partiel ne rejoue pas les
// destinataires déjà servis.
export interface DeliveryResult {
  outcome: DeliveryOutcome;
  delivered: string[];
}

// ─── Helpers DB ───────────────────────────────────────────────────────────────

async function getResponsablesEmails(): Promise<string[]> {
  const { rows } = await pool.query<{ email: string }>(
    `SELECT email FROM sentinel_users
     WHERE role = 'RESPONSABLE' AND is_active = TRUE AND is_deleted = FALSE
       AND email IS NOT NULL AND email <> ''`
  );
  return rows.map((r) => r.email);
}

async function getMaintenanceEmails(): Promise<string[]> {
  const { rows } = await pool.query<{ email: string }>(
    `SELECT email FROM sentinel_users
     WHERE role = 'MAINTENANCE' AND is_active = TRUE AND is_deleted = FALSE
       AND email IS NOT NULL AND email <> ''`
  );
  return rows.map((r) => r.email);
}

async function getFollowersEmails(incidentId: number): Promise<string[]> {
  const { rows } = await pool.query<{ email: string }>(
    `SELECT su.email
     FROM workshop_incident_followers wif
     JOIN sentinel_users su ON su.id = wif.user_id
     WHERE wif.incident_id = $1
       AND wif.deleted_at IS NULL
       AND su.is_active = TRUE
       AND su.is_deleted = FALSE
       AND su.email IS NOT NULL AND su.email <> ''`,
    [incidentId]
  );
  return rows.map((r) => r.email);
}

async function getUserEmail(userId: number): Promise<string | null> {
  const { rows } = await pool.query<{ email: string | null }>(
    `SELECT email FROM sentinel_users
     WHERE id = $1 AND is_deleted = FALSE AND is_active = TRUE`,
    [userId]
  );
  return rows[0]?.email ?? null;
}

async function getIncidentSnapshot(incidentId: number): Promise<{
  line_number: string;
  machine_id: string;
  user_id: number;
  taken_by_user_id: number | null;
} | null> {
  const { rows } = await pool.query(
    `SELECT line_number, machine_id, user_id, taken_by_user_id
     FROM workshop_incidents WHERE id = $1`,
    [incidentId]
  );
  return rows[0] ?? null;
}

async function resolveActorName(actorUserId: number): Promise<string> {
  const { rows } = await pool.query<{ first_name: string; last_name: string }>(
    `SELECT first_name, last_name FROM sentinel_users WHERE id = $1`,
    [actorUserId]
  );
  if (!rows[0]) return 'Utilisateur';
  return `${rows[0].first_name} ${rows[0].last_name}`.trim();
}

// ─── Envoi bas niveau ────────────────────────────────────────────────────────

async function sendMail(
  to: string | string[],
  subject: string,
  html: string,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  const mailer = getMailer();
  if (!mailer) return { outcome: 'SKIPPED_DISABLED', delivered: [] };

  const recipients = Array.from(
    new Set((Array.isArray(to) ? to : [to]).map((recipient) => recipient.trim()).filter(Boolean))
  ).filter((recipient) => !alreadyDelivered.has(recipient));
  if (recipients.length === 0) {
    // Tous les destinataires visés ont déjà été confirmés lors d'une
    // tentative précédente : ce n'est pas une absence de destinataire, c'est
    // une reprise déjà complète pour ce canal.
    return { outcome: alreadyDelivered.size > 0 ? 'SENT' : 'SKIPPED_NO_RECIPIENT', delivered: [] };
  }

  // Alternative texte brut (C-09) : le message reste lisible quand le client
  // bloque le HTML/les images. Nodemailer émet alors un `multipart/alternative`
  // (text + html) plutôt qu'un HTML seul.
  const text = htmlToText(html);

  // Un message par destinataire : aucune adresse professionnelle n'est
  // divulguée aux autres personnes notifiées via l'en-tête To.
  const results = await Promise.allSettled(
    recipients.map((recipient) =>
      mailer.sendMail({
        from: getSenderAddress(),
        to: recipient,
        subject,
        html,
        text,
      })
    )
  );
  const delivered: string[] = [];
  let failureCount = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      delivered.push(recipients[index]);
      return;
    }
    failureCount += 1;
    // L'erreur Nodemailer peut contenir le destinataire dans son message ou
    // ses propriétés. Ne journaliser que des métadonnées techniques sûres.
    const mailError = result.reason as { name?: unknown; code?: unknown };
    logger.error(
      {
        errorName: typeof mailError?.name === 'string' ? mailError.name : 'Error',
        errorCode: typeof mailError?.code === 'string' ? mailError.code : undefined,
        subject,
      },
      '[mailer] Failed to send email'
    );
  });
  if (failureCount > 0) {
    const error = new Error('One or more notification deliveries failed.') as Error & {
      code?: string;
      delivered?: string[];
    };
    error.code = 'SMTP_DELIVERY_FAILED';
    // Porté sur l'erreur : même un échec partiel doit permettre à l'appelant
    // de persister les destinataires déjà confirmés avant de relancer (OUT-03).
    error.delivered = delivered;
    throw error;
  }
  return { outcome: 'SENT', delivered };
}

function clientOrigin(): string {
  return process.env.CLIENT_ORIGIN || 'http://localhost:5173';
}

// ─── Notifications admin ──────────────────────────────────────────────────────

export async function notifyAdminPasswordResetRequested(
  data: {
    firstName: string;
    lastName: string;
    badgeNumber: string;
    requestedAt: Date;
  },
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_admin')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const adminEmail = await getAdminEmail();
  if (!adminEmail) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };
  return sendMail(
    adminEmail,
    adminResetTemplate.subject(),
    adminResetTemplate.html({
      ...data,
      adminUrl: `${clientOrigin()}/admin/users`,
    }),
    alreadyDelivered
  );
}

// ─── Notifications responsable — action requise ───────────────────────────────

export async function notifyResponsablesEditRequested(
  incidentId: number,
  actorUserId: number,
  detail: string,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_responsables')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [emails, incident, actorName] = await Promise.all([
    getResponsablesEmails(),
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (emails.length === 0 || !incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    emails,
    actionRequiredTemplate.subjectActionRequired('Demande de correction', incidentId),
    actionRequiredTemplate.htmlActionRequired({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      actionLabel: 'Demande de correction',
      detail,
      actorName,
      adminUrl: `${clientOrigin()}/workshop/pilotage`,
    }),
    alreadyDelivered
  );
}

export async function notifyResponsablesCancelRequested(
  incidentId: number,
  actorUserId: number,
  reason: string,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_responsables')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [emails, incident, actorName] = await Promise.all([
    getResponsablesEmails(),
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (emails.length === 0 || !incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    emails,
    actionRequiredTemplate.subjectActionRequired("Demande d'annulation", incidentId),
    actionRequiredTemplate.htmlActionRequired({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      actionLabel: "Demande d'annulation",
      detail: reason,
      actorName,
      adminUrl: `${clientOrigin()}/workshop/pilotage`,
    }),
    alreadyDelivered
  );
}

// ─── Notifications responsable — followers ────────────────────────────────────

export async function notifyFollowersIncidentTaken(
  incidentId: number,
  actorUserId: number,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_operateurs')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [emails, incident, actorName] = await Promise.all([
    getFollowersEmails(incidentId),
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (emails.length === 0 || !incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    emails,
    incidentUpdateTemplate.subjectIncidentUpdate('Pris en charge', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Pris en charge',
      detail: `Prise en charge par ${actorName}`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/pilotage`,
    }),
    alreadyDelivered
  );
}

export async function notifyFollowersIncidentSetPending(
  incidentId: number,
  actorUserId: number,
  waitingReason: string,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_operateurs')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [emails, incident, actorName] = await Promise.all([
    getFollowersEmails(incidentId),
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (emails.length === 0 || !incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    emails,
    incidentUpdateTemplate.subjectIncidentUpdate('Suspendu', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Incident suspendu',
      detail: `Motif de mise en attente : ${waitingReason}`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/pilotage`,
    }),
    alreadyDelivered
  );
}

export async function notifyFollowersIncidentClosed(
  incidentId: number,
  actorUserId: number,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_operateurs')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [emails, incident, actorName] = await Promise.all([
    getFollowersEmails(incidentId),
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (emails.length === 0 || !incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    emails,
    incidentUpdateTemplate.subjectIncidentUpdate('Clôturé', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Incident clôturé',
      detail: `Clôturé par ${actorName}`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/history`,
    }),
    alreadyDelivered
  );
}

export async function notifyFollowersIncidentCanceled(
  incidentId: number,
  actorUserId: number,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_operateurs')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [emails, incident, actorName] = await Promise.all([
    getFollowersEmails(incidentId),
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (emails.length === 0 || !incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    emails,
    incidentUpdateTemplate.subjectIncidentUpdate('Annulé', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Incident annulé',
      detail: `Annulé par ${actorName}`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/history`,
    }),
    alreadyDelivered
  );
}

// ─── Notifications maintenance ────────────────────────────────────────────────

export async function notifyMaintenanceIncidentUrgent(
  incidentId: number,
  actorUserId: number,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_techniciens')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [emails, incident, actorName] = await Promise.all([
    getMaintenanceEmails(),
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (emails.length === 0 || !incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    emails,
    incidentUpdateTemplate.subjectIncidentUpdate('URGENT', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Incident marqué URGENT',
      detail: `Priorité définie par ${actorName} — intervention immédiate requise`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/pilotage`,
    }),
    alreadyDelivered
  );
}

export async function notifyTechnicianResponsibleComment(
  incidentId: number,
  actorUserId: number,
  comment: string,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_techniciens')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [incident, actorName] = await Promise.all([
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (!incident?.taken_by_user_id) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  const email = await getUserEmail(incident.taken_by_user_id);
  if (!email) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    email,
    incidentUpdateTemplate.subjectIncidentUpdate('Consigne du responsable', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Consigne du responsable',
      detail: comment,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/pilotage`,
    }),
    alreadyDelivered
  );
}

export async function notifyTechnicianIncidentCanceled(
  incidentId: number,
  actorUserId: number,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_techniciens')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [incident, actorName] = await Promise.all([
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (!incident?.taken_by_user_id) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  const email = await getUserEmail(incident.taken_by_user_id);
  if (!email) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    email,
    incidentUpdateTemplate.subjectIncidentUpdate('Annulé', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Incident annulé',
      detail: `Votre incident en cours a été annulé par ${actorName}`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/history`,
    }),
    alreadyDelivered
  );
}

export async function notifyTechnicianIncidentInvalidated(
  incidentId: number,
  actorUserId: number,
  reason: string,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_techniciens')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [incident, actorName] = await Promise.all([
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (!incident?.taken_by_user_id) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  const email = await getUserEmail(incident.taken_by_user_id);
  if (!email) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    email,
    incidentUpdateTemplate.subjectIncidentUpdate('Clôture invalidée', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Clôture invalidée par le responsable',
      detail: `Motif : ${reason}`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/history`,
    }),
    alreadyDelivered
  );
}

// ─── Notifications opérateur déclarant ───────────────────────────────────────

export async function notifyDeclarantIncidentTaken(
  incidentId: number,
  actorUserId: number,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_operateurs')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [incident, actorName] = await Promise.all([
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (!incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  const email = await getUserEmail(incident.user_id);
  if (!email) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    email,
    incidentUpdateTemplate.subjectIncidentUpdate('Pris en charge', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Votre incident est pris en charge',
      detail: `Prise en charge par ${actorName}`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/dashboard`,
    }),
    alreadyDelivered
  );
}

export async function notifyDeclarantEditApproved(
  incidentId: number,
  actorUserId: number,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_operateurs')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [incident, actorName] = await Promise.all([
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (!incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  const email = await getUserEmail(incident.user_id);
  if (!email) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    email,
    incidentUpdateTemplate.subjectIncidentUpdate('Correction approuvée', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Votre demande de correction a été approuvée',
      detail: `Approuvée par ${actorName}`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/dashboard`,
    }),
    alreadyDelivered
  );
}

export async function notifyDeclarantEditRejected(
  incidentId: number,
  actorUserId: number,
  decisionReason = '',
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_operateurs')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [incident, actorName] = await Promise.all([
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (!incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  const email = await getUserEmail(incident.user_id);
  if (!email) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  // Le motif de refus fait partie du contrat de traçabilité (RC3 §6) : il
  // apparaît dans la notification, au même titre que dans l'Historique/Journal.
  const reason = decisionReason.trim();
  const detail = reason
    ? `Refusée par ${actorName} — Motif : ${reason}`
    : `Refusée par ${actorName}`;

  return sendMail(
    email,
    incidentUpdateTemplate.subjectIncidentUpdate('Correction refusée', incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: 'Votre demande de correction a été refusée',
      detail,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/dashboard`,
    }),
    alreadyDelivered
  );
}

export async function notifyDeclarantCancelApproved(
  incidentId: number,
  actorUserId: number,
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_operateurs')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [incident, actorName] = await Promise.all([
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (!incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  const email = await getUserEmail(incident.user_id);
  if (!email) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  return sendMail(
    email,
    incidentUpdateTemplate.subjectIncidentUpdate("Demande d'annulation approuvée", incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: "Votre demande d'annulation a été approuvée",
      detail: `Approuvée par ${actorName}`,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/history`,
    }),
    alreadyDelivered
  );
}

export async function notifyDeclarantCancelRejected(
  incidentId: number,
  actorUserId: number,
  decisionReason = '',
  alreadyDelivered: ReadonlySet<string> = new Set()
): Promise<DeliveryResult> {
  if (!(await getAdminNotifPref('notif_operateurs')))
    return { outcome: 'SKIPPED_DISABLED', delivered: [] };
  const [incident, actorName] = await Promise.all([
    getIncidentSnapshot(incidentId),
    resolveActorName(actorUserId),
  ]);
  if (!incident) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  const email = await getUserEmail(incident.user_id);
  if (!email) return { outcome: 'SKIPPED_NO_RECIPIENT', delivered: [] };

  // Motif de refus inclus dans la notification (RC3 §6), comme pour la correction.
  const reason = decisionReason.trim();
  const detail = reason
    ? `Refusée par ${actorName} — Motif : ${reason}`
    : `Refusée par ${actorName}`;

  return sendMail(
    email,
    incidentUpdateTemplate.subjectIncidentUpdate("Demande d'annulation refusée", incidentId),
    incidentUpdateTemplate.htmlIncidentUpdate({
      incidentId,
      lineNumber: incident.line_number,
      machineId: incident.machine_id,
      eventLabel: "Votre demande d'annulation a été refusée",
      detail,
      actorName,
      workshopUrl: `${clientOrigin()}/workshop/dashboard`,
    }),
    alreadyDelivered
  );
}
