import { layout } from './layout';

export interface PasswordResetRequestedData {
  firstName: string;
  lastName: string;
  badgeNumber: string;
  requestedAt: Date;
  adminUrl: string;
}

export function subject(): string {
  return '[Sentinel] Demande de réinitialisation de mot de passe';
}

export function html(data: PasswordResetRequestedData): string {
  const date = data.requestedAt.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Paris',
  });

  const body = `
    <h2 style="margin:0 0 8px 0;color:#1a1a2e;font-size:20px;">Demande de réinitialisation</h2>
    <p style="margin:0 0 24px 0;color:#6b7280;font-size:14px;">${date}</p>

    <p style="margin:0 0 16px 0;color:#374151;font-size:15px;">
      Un utilisateur atelier n'arrive plus à se connecter et demande une réinitialisation de son mot de passe.
    </p>

    <table cellpadding="0" cellspacing="0" style="width:100%;background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:24px;">
      <tr>
        <td style="padding:6px 0;">
          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Nom</span><br/>
          <span style="color:#111827;font-size:15px;font-weight:500;">${data.lastName} ${data.firstName}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;border-top:1px solid #e5e7eb;">
          <span style="color:#6b7280;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Badge</span><br/>
          <span style="color:#111827;font-size:15px;font-weight:500;font-family:monospace;">${data.badgeNumber}</span>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 20px 0;color:#374151;font-size:14px;">
      Ouvrez la fiche utilisateur, cliquez sur <strong>Réinitialiser le mot de passe</strong>,
      puis transmettez le code temporaire à l'utilisateur par voie interne sécurisée.
    </p>

    <a href="${data.adminUrl}"
       style="display:inline-block;background:#1a1a2e;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600;">
      Accéder à l'administration
    </a>
  `;

  return layout(subject(), body);
}
