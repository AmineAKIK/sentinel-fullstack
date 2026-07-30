import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

async function loginAsWorkshop(page: Page, badge: string): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(badge);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function chooseSelectField(
  page: Page,
  ariaLabel: string,
  optionText: string | RegExp
): Promise<void> {
  await page.getByRole('combobox', { name: ariaLabel }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

// Tête dédiée à ce spec : la machine E2E-MCH-1 a ses 16 têtes déjà réservées
// par d'autres specs (voir backend/scripts/seedE2E.ts et workshop-mutation-
// feedback.spec.ts). Chaque test ici annule son incident avant de terminer
// pour rendre la tête au test suivant, dans ce fichier comme dans les autres.
const DEDICATED_HEAD = 16;

async function createIncident(page: Page, product: string, head: number) {
  await page.getByRole('button', { name: '+ Créer un incident' }).click();
  await chooseSelectField(page, 'Ligne', '999');
  await chooseSelectField(page, 'Machine', /E2E-MCH-1/);
  await chooseSelectField(page, 'Robot', '1');
  await chooseSelectField(page, 'Tête', String(head));
  await chooseSelectField(page, 'État', 'Dégradée');
  await page.getByPlaceholder('Référence produit').fill(product);
  await page.getByLabel('Commentaire').fill(`Signalement ${product}`);
  await page.getByRole('button', { name: 'Aperçu' }).click();
  await page.getByRole('button', { name: 'Valider la création' }).click();
  await expect(page.getByRole('status')).toContainText('Incident signalé.');
  const card = page.locator('article', { hasText: product });
  await expect(card).toBeVisible();
  return card;
}

async function cancelIncident(page: Page): Promise<void> {
  const panel = page.locator('aside.incident-detail-drawer');
  await panel.getByRole('button', { name: "Annuler l'incident" }).click();
  const dialog = page.getByRole('dialog', { name: "Annuler l'incident" });
  await dialog.getByRole('button', { name: 'Confirmer l’annulation' }).click();
  await expect(page.getByRole('status')).toContainText('Incident annulé');
}

// Coefficients de luminance relative sRGB (WCAG 2.x).
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [rl, gl, bl] = [linear(r), linear(g), linear(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function parseRgb(value: string): [number, number, number] {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) throw new Error(`couleur inattendue: ${value}`);
  const [r, g, b] = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
  return [r, g, b];
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseRgb(a));
  const lb = relativeLuminance(parseRgb(b));
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

test.describe('Urgence — sémantique visuelle critique (RC5)', () => {
  test('desktop 1440×900 : activation critique rouge, contraste AA, une requête, retrait en contour', async ({
    page,
  }) => {
    const product = `E2E-RC5-URGENT-DESKTOP-${Date.now()}`;
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
    const card = await createIncident(page, product, DEDICATED_HEAD);
    await card.getByRole('link', { name: /Ouvrir incident/i }).click();
    const panel = page.locator('aside.incident-detail-drawer');

    const activate = panel.getByRole('button', { name: 'Déclarer urgent' });
    await expect(activate).toBeVisible();
    await expect(activate).toHaveAttribute('aria-pressed', 'false');

    for (let index = 0; index < 80; index += 1) {
      if (await activate.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(activate).toBeFocused();
    const outline = await activate.evaluate(
      (element) => window.getComputedStyle(element).outlineStyle
    );
    expect(outline, 'focus clavier visible (outline)').not.toBe('none');

    const badge = panel.locator('.incident-chip--critical', { hasText: 'Urgent' });
    // Pas encore urgent : le badge n'est pas rendu.
    await expect(badge).toHaveCount(0);

    const geometry = await activate.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        width: rect.width,
        height: rect.height,
        backgroundColor: style.backgroundColor,
        color: style.color,
        overflowsHorizontally: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    await test.info().attach('geometrie-couleur-desktop-activation', {
      body: JSON.stringify(geometry, null, 2),
      contentType: 'application/json',
    });

    // --color-warning résout à rgb(180, 83, 9) : l'orange ne doit plus apparaître ici.
    expect(geometry.backgroundColor).not.toBe('rgb(180, 83, 9)');
    const ratio = contrastRatio(geometry.backgroundColor, geometry.color);
    expect(
      ratio,
      `contraste texte/fond WCAG AA (mesuré ${ratio.toFixed(2)}:1)`
    ).toBeGreaterThanOrEqual(4.5);
    expect(geometry.overflowsHorizontally).toBe(false);

    const mutationRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && request.postData()?.includes('isPriority')) {
        mutationRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    const box = await activate.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.dblclick(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page.getByRole('status')).toContainText('Incident déclaré urgent.');
    expect(mutationRequests).toHaveLength(1);

    const remove = panel.getByRole('button', { name: "Retirer l'urgence" });
    await expect(remove).toBeVisible();
    await expect(remove).toHaveAttribute('aria-pressed', 'true');
    await expect(badge).toBeVisible();

    const removeStyle = await remove.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return { backgroundColor: style.backgroundColor, color: style.color };
    });
    // Le retrait doit se distinguer visuellement de l'activation (pleine
    // rouge) : fond non plein-rouge, typiquement contour + surface neutre.
    expect(removeStyle.backgroundColor).not.toBe(geometry.backgroundColor);

    await page.getByRole('button', { name: 'Fermer la notification' }).click();
    await remove.click();
    await expect(page.getByRole('status')).toContainText('Urgence retirée.');
    await expect(activate).toBeVisible();
    await expect(activate).toHaveAttribute('aria-pressed', 'false');
    await expect(badge).toHaveCount(0);

    await page.getByRole('button', { name: 'Fermer la notification' }).click();
    await cancelIncident(page);
  });

  test('mobile 390×844 : cible tactile ≥44px, pleine largeur acceptable, aucun débordement', async ({
    page,
  }) => {
    const product = `E2E-RC5-URGENT-MOBILE-${Date.now()}`;
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
    const card = await createIncident(page, product, DEDICATED_HEAD);
    await card.getByRole('link', { name: /Ouvrir incident/i }).click();
    const panel = page.locator('aside.incident-detail-drawer');

    const activate = panel.getByRole('button', { name: 'Déclarer urgent' });
    await expect(activate).toBeVisible();

    const metrics = await activate.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        overflowsHorizontally: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
    expect(metrics.height).toBeGreaterThanOrEqual(44);
    expect(metrics.overflowsHorizontally).toBe(false);

    await cancelIncident(page);
  });

  test('zoom 200 % (viewport 640×720) : aucun débordement et bouton toujours actionnable', async ({
    page,
  }) => {
    const product = `E2E-RC5-URGENT-ZOOM-${Date.now()}`;
    await page.setViewportSize({ width: 640, height: 720 });
    await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
    const card = await createIncident(page, product, DEDICATED_HEAD);
    await card.getByRole('link', { name: /Ouvrir incident/i }).click();
    const panel = page.locator('aside.incident-detail-drawer');

    const activate = panel.getByRole('button', { name: 'Déclarer urgent' });
    await expect(activate).toBeVisible();
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflows).toBe(false);

    await activate.click();
    await expect(page.getByRole('status')).toContainText('Incident déclaré urgent.');

    await page.getByRole('button', { name: 'Fermer la notification' }).click();
    await cancelIncident(page);
  });

  test('erreur contrôlée puis vrai réessai réussi, sans notification concurrente', async ({
    page,
  }) => {
    const product = `E2E-RC5-URGENT-ERREUR-${Date.now()}`;
    await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
    const card = await createIncident(page, product, DEDICATED_HEAD);
    await card.getByRole('link', { name: /Ouvrir incident/i }).click();
    const panel = page.locator('aside.incident-detail-drawer');
    const activate = panel.getByRole('button', { name: 'Déclarer urgent' });

    let failOnce = true;
    const controlledFailure = async (route: Route) => {
      const request = route.request();
      const payload = request.postDataJSON() as { isPriority?: boolean } | null;
      if (failOnce && request.method() === 'PATCH' && payload?.isPriority !== undefined) {
        failOnce = false;
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'CONFLICT', message: 'stale-version', status: 409 },
          }),
        });
        return;
      }
      await route.continue();
    };
    await page.route('**/api/workshop/incidents/*', controlledFailure);

    await activate.click();
    await expect(page.getByRole('alert')).toContainText(
      'Cette action entre en conflit avec l’état actuel. Rechargez puis réessayez.'
    );
    await expect(activate).toBeEnabled();
    await expect(page.getByRole('status')).toHaveCount(0);

    await activate.click();
    await expect(page.getByRole('status')).toContainText('Incident déclaré urgent.');
    await expect(page.getByRole('status')).toHaveCount(1);

    await page.getByRole('button', { name: 'Fermer la notification' }).click();
    await cancelIncident(page);
  });

  test('axe-core : aucune violation WCAG2A/AA sur le panneau avec le contrôle d’urgence', async ({
    page,
  }) => {
    const product = `E2E-RC5-URGENT-AXE-${Date.now()}`;
    await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
    const card = await createIncident(page, product, DEDICATED_HEAD);
    await card.getByRole('link', { name: /Ouvrir incident/i }).click();
    const panel = page.locator('aside.incident-detail-drawer');
    await expect(panel.getByRole('button', { name: 'Déclarer urgent' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('aside.incident-detail-drawer')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await cancelIncident(page);
  });
});
