import { escapeHtml, layout } from './layout';

export interface ActionRequiredData {
  incidentId: number;
  lineNumber: string;
  machineId: string;
  actionLabel: string;
  detail: string;
  actorName: string;
  adminUrl: string;
}

export function subjectActionRequired(actionLabel: string, incidentId: number): string {
  return `[Sentinel] Action requise — ${actionLabel} (incident #${incidentId})`;
}

export function htmlActionRequired(data: ActionRequiredData): string {
  const incidentId = escapeHtml(data.incidentId);
  const actionLabel = escapeHtml(data.actionLabel);
  const lineNumber = escapeHtml(data.lineNumber);
  const machineId = escapeHtml(data.machineId);
  const actorName = escapeHtml(data.actorName);
  const detail = escapeHtml(data.detail);
  const adminUrl = escapeHtml(data.adminUrl);

  const body = `
    <h2 style="margin:0 0 8px 0;color:#1a1a2e;font-size:20px;">Action requise</h2>
    <p style="margin:0 0 24px 0;color:#6b7280;font-size:14px;">Incident #${incidentId} — ${actionLabel}</p>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:24px;">
      <tr><td style="padding:6px 0;">
        <span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Ligne</span><br/>
        <span style="color:#111827;font-size:14px;">${lineNumber}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-top:1px solid #e5e7eb;">
        <span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Machine</span><br/>
        <span style="color:#111827;font-size:14px;">${machineId}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-top:1px solid #e5e7eb;">
        <span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Demandé par</span><br/>
        <span style="color:#111827;font-size:14px;">${actorName}</span>
      </td></tr>
      <tr><td style="padding:6px 0;border-top:1px solid #e5e7eb;">
        <span style="color:#6b7280;font-size:12px;font-weight:600;text-transform:uppercase;">Détail</span><br/>
        <span style="color:#111827;font-size:14px;">${detail}</span>
      </td></tr>
    </table>

    <a href="${adminUrl}"
       style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
      Voir l'incident
    </a>
  `;

  return layout(subjectActionRequired(data.actionLabel, data.incidentId), body);
}
