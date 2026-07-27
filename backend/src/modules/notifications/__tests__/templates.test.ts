import { html as htmlPasswordReset } from '../templates/admin-password-reset-requested';
import { htmlIncidentUpdate } from '../templates/incident-update';
import { htmlToText, layout } from '../templates/layout';
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

describe('email lisible sans images (C-09)', () => {
  it('aucun gabarit ne dépend d’une image : le contenu essentiel est du texte', () => {
    const incident = htmlIncidentUpdate({
      incidentId: 42,
      lineNumber: 'L07',
      machineId: 'MCH-2117',
      eventLabel: 'Incident suspendu',
      detail: 'Motif de mise en attente : Attente pièce',
      actorName: 'Assia AKIK',
      workshopUrl: 'https://sentinel.example.test/workshop/dashboard',
    });
    const action = htmlActionRequired({
      incidentId: 42,
      lineNumber: 'L07',
      machineId: 'MCH-2117',
      actionLabel: 'Demande de correction',
      detail: 'Champ état : Dégradée → Indisponible',
      actorName: 'Éric Op',
      adminUrl: 'https://sentinel.example.test/workshop/dashboard',
    });
    const reset = htmlPasswordReset({
      firstName: 'Jean',
      lastName: 'Dupont',
      badgeNumber: '990002',
      requestedAt: new Date('2026-07-13T08:30:00.000Z'),
      adminUrl: 'https://sentinel.example.test/admin/users',
    });
    // Aucune balise image dans aucun gabarit : aucune information ne peut être
    // enfermée dans une image bloquée par le client.
    for (const email of [incident, action, reset]) {
      expect(email).not.toMatch(/<img\b/i);
      expect(email).not.toMatch(/background-image/i);
    }
  });

  it('l’alternative texte brut porte toutes les informations indispensables + le lien', () => {
    const html = htmlIncidentUpdate({
      incidentId: 42,
      lineNumber: 'L07',
      machineId: 'MCH-2117',
      eventLabel: 'Incident suspendu',
      detail: 'Motif de mise en attente : Attente pièce détachée',
      actorName: 'Assia AKIK',
      workshopUrl: 'https://sentinel.example.test/workshop/dashboard',
    });
    const text = htmlToText(html);

    // Type de décision, incident, ligne, machine, acteur, motif utile.
    expect(text).toContain('Incident suspendu');
    expect(text).toContain('Incident #42');
    expect(text).toContain('L07');
    expect(text).toContain('MCH-2117');
    expect(text).toContain('Assia AKIK');
    expect(text).toContain('Motif de mise en attente : Attente pièce détachée');
    // Le lien reste actionnable en texte brut (libellé : URL).
    expect(text).toContain('https://sentinel.example.test/workshop/dashboard');
    // Aucun balisage HTML résiduel dans la partie texte.
    expect(text).not.toMatch(/<[^>]+>/);
  });

  it('l’alternative texte brut décode les entités et n’expose aucun balisage', () => {
    // Une donnée contenant des caractères spéciaux est échappée en HTML puis
    // redécodée en texte brut (l'utilisateur lit « A & B », pas « A &amp; B »).
    const html = htmlIncidentUpdate({
      incidentId: 7,
      lineNumber: 'A & B',
      machineId: 'M<1>',
      eventLabel: 'Correction refusée',
      detail: 'Motif : valeurs "incohérentes"',
      actorName: "Marc O'Neil",
      workshopUrl: 'https://sentinel.example.test/x?a=1&b=2',
    });
    const text = htmlToText(html);

    expect(text).toContain('A & B');
    expect(text).toContain('M<1>');
    expect(text).toContain('valeurs "incohérentes"');
    expect(text).toContain("Marc O'Neil");
    expect(text).toContain('https://sentinel.example.test/x?a=1&b=2');
    expect(text).not.toContain('&amp;');
    expect(text).not.toContain('&lt;');
    expect(text).not.toContain('&quot;');
  });
});
