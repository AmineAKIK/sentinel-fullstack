/**
 * Encode une valeur avant son insertion dans du HTML ou dans un attribut HTML.
 * Les templates d'email ne doivent jamais interpoler directement une donnée
 * provenant de la base, d'un utilisateur ou de la configuration.
 */
export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * Dérive une alternative texte brut lisible depuis le HTML d'un email (C-09).
 * Objectif : que le sujet, le type de décision, l'incident, la ligne, la
 * machine, l'acteur, le motif utile et le lien restent intégralement lisibles
 * quand le client bloque les images ou n'affiche pas le HTML. Comme les
 * gabarits ne portent JAMAIS d'information dans une image (aucun `<img>`), tout
 * le contenu essentiel est déjà présent sous forme de texte dans le HTML : on
 * le restitue en supprimant le balisage, en conservant les URL des liens, et en
 * normalisant les espaces.
 */
export function htmlToText(html: string): string {
  const withLinks = html.replace(
    /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      const url = href.trim();
      // « Libellé : URL » pour que le lien reste actionnable en texte brut.
      return text && url ? `${text} : ${url}` : url || text;
    }
  );

  const text = withLinks
    // Les sauts de bloc deviennent des retours à la ligne.
    .replace(/<\/(p|div|tr|h[1-6]|table|li)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Tout autre balisage est retiré.
    .replace(/<[^>]+>/g, '')
    // Décodage des entités que nos gabarits produisent.
    .replace(/&amp;|&lt;|&gt;|&quot;|&#39;|&nbsp;/g, (entity) => HTML_ENTITIES[entity] ?? entity);

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:20px 32px;border-radius:8px 8px 0 0;">
              <span style="color:#ffffff;font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;">SENTINEL</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px;border-radius:0 0 8px 8px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 0;text-align:center;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                Cet email est généré automatiquement par Sentinel — ne pas répondre.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
