import { html as htmlPasswordReset } from '../templates/admin-password-reset-requested';
import { htmlIncidentUpdate } from '../templates/incident-update';
import { layout } from '../templates/layout';
import { htmlActionRequired } from '../templates/responsable-action-required';

const attack = '<img src=x onerror="alert(1)">\'&';
const escapedAttack = '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;';

describe('notification email templates', () => {
  it('échappe le titre du layout sans altérer le corps HTML de confiance', () => {
    const result = layout(attack, '<p>Corps de confiance</p>');

    expect(result).toContain(`<title>${escapedAttack}</title>`);
    expect(result).toContain('<p>Corps de confiance</p>');
    expect(result).not.toContain(`<title>${attack}</title>`);
  });

  it("échappe toutes les données dynamiques d'une notification d'incident", () => {
    const result = htmlIncidentUpdate({
      incidentId: 42,
      lineNumber: attack,
      machineId: attack,
      eventLabel: attack,
      detail: attack,
      actorName: attack,
      workshopUrl: `https://sentinel.example.test/${attack}`,
    });

    expect(result).not.toContain(attack);
    expect(result).toContain(escapedAttack);
    expect(result).toContain(`href="https://sentinel.example.test/${escapedAttack}"`);
  });

  it("échappe toutes les données dynamiques d'une demande d'arbitrage", () => {
    const result = htmlActionRequired({
      incidentId: 42,
      lineNumber: attack,
      machineId: attack,
      actionLabel: attack,
      detail: attack,
      actorName: attack,
      adminUrl: `https://sentinel.example.test/${attack}`,
    });

    expect(result).not.toContain(attack);
    expect(result).toContain(escapedAttack);
    expect(result).toContain(`href="https://sentinel.example.test/${escapedAttack}"`);
  });

  it('échappe les données de la demande de réinitialisation', () => {
    const result = htmlPasswordReset({
      firstName: attack,
      lastName: attack,
      badgeNumber: attack,
      requestedAt: new Date('2026-07-13T08:30:00.000Z'),
      adminUrl: `https://sentinel.example.test/${attack}`,
    });

    expect(result).not.toContain(attack);
    expect(result).toContain(escapedAttack);
    expect(result).toContain(`href="https://sentinel.example.test/${escapedAttack}"`);
  });
});
