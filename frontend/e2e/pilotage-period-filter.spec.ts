import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

async function loginAsResponsable(page: Page): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(E2E_RESPONSABLE_BADGE);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function chooseSelectField(page: Page, ariaLabel: string, optionText: string) {
  const combobox = page.getByRole('combobox', { name: ariaLabel });
  await combobox.click();
  await expect(combobox).toHaveAttribute('aria-expanded', 'true');
  const option = page.getByRole('option', { name: optionText, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  await expect(combobox).toHaveAttribute('aria-expanded', 'false');
}

async function goToPilotage(page: Page): Promise<void> {
  await loginAsResponsable(page);
  await page.goto('/workshop/pilotage');
  await expect(page.getByRole('heading', { name: 'Pilotage atelier' })).toBeVisible();
  await expect(page.getByText('Chargement des indicateurs…')).toHaveCount(0);
}

test.describe('Pilotage — filtre de période bidirectionnel (RC5)', () => {
  test('scénario principal : preset → modification directe → bascule "Personnalisée" → resynchronisation preset', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goToPilotage(page);

    const start = page.locator('#pilotage-date-start');
    const end = page.locator('#pilotage-date-end');
    const periodCombobox = page.getByRole('combobox', { name: 'Période' });

    // 1-2. "7 derniers jours" (défaut) : les deux dates effectives sont affichées.
    await expect(start).not.toHaveValue('');
    await expect(end).not.toHaveValue('');
    await expect(start).toBeEnabled();
    await expect(end).toBeEnabled();

    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/workshop/analytics')) requests.push(request.url());
    });

    // 3. Modification directe d'une borne sans toucher au sélecteur.
    const newStart = await start.inputValue();
    const earlierStart = new Date(newStart);
    earlierStart.setDate(earlierStart.getDate() - 2);
    const earlierStartValue = earlierStart.toISOString().slice(0, 10);
    const dateChangeResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/api/workshop/analytics') &&
        response.ok()
    );
    await start.fill(earlierStartValue);
    await start.blur();
    await dateChangeResponse;

    // 4. Bascule automatique vers "Personnalisée".
    await expect(periodCombobox).toContainText('Personnalisée');
    await expect(start).toHaveValue(earlierStartValue);
    await expect(page.getByText('Chargement des indicateurs…')).toHaveCount(0);

    // 5. Une seule requête pour ce changement.
    const countAfterDateChange = requests.length;
    expect(countAfterDateChange).toBe(1);

    requests.length = 0;

    // 6. Sélection de "30 derniers jours".
    const presetResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().includes('/api/workshop/analytics') &&
        response.ok()
    );
    await chooseSelectField(page, 'Période', '30 derniers jours');
    await presetResponse;

    // 7. Resynchronisation des deux dates + une seule nouvelle requête.
    await expect(start).not.toHaveValue(earlierStartValue);
    await expect(start).not.toHaveValue('');
    await expect(end).not.toHaveValue('');
    await expect(page.getByText('Chargement des indicateurs…')).toHaveCount(0);
    expect(requests.length).toBe(1);

    // 8. Aucun débordement horizontal.
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflows).toBe(false);
  });

  test('libellé exact "90 derniers jours" sans "(max)"', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goToPilotage(page);

    await page.getByRole('combobox', { name: 'Période' }).click();
    await expect(
      page.getByRole('option', { name: '90 derniers jours', exact: true })
    ).toBeVisible();
    await expect(page.getByRole('option', { name: '90 derniers jours (max)' })).toHaveCount(0);
  });

  test('modifier Fin depuis un preset bascule aussi sur "Personnalisée"', async ({ page }) => {
    await goToPilotage(page);
    const end = page.locator('#pilotage-date-end');
    const periodCombobox = page.getByRole('combobox', { name: 'Période' });

    await expect(end).toBeEnabled();
    await end.fill('2026-01-15');
    await end.blur();

    await expect(periodCombobox).toContainText('Personnalisée');
    await expect(end).toHaveValue('2026-01-15');
  });

  test('sélection explicite de "Personnalisée" conserve les dates déjà affichées par le preset', async ({
    page,
  }) => {
    await goToPilotage(page);
    await chooseSelectField(page, 'Période', '30 derniers jours');
    const start = page.locator('#pilotage-date-start');
    const end = page.locator('#pilotage-date-end');
    const displayedStart = await start.inputValue();
    const displayedEnd = await end.inputValue();

    await chooseSelectField(page, 'Période', 'Personnalisée');

    await expect(start).toHaveValue(displayedStart);
    await expect(end).toHaveValue(displayedEnd);
  });

  test('début postérieur à la fin affiche une erreur accessible liée aux champs', async ({
    page,
  }) => {
    await goToPilotage(page);
    await chooseSelectField(page, 'Période', 'Personnalisée');
    const start = page.locator('#pilotage-date-start');
    const end = page.locator('#pilotage-date-end');

    await start.fill('2026-03-10');
    await end.fill('2026-03-01');

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    const alertId = await alert.getAttribute('id');
    if (alertId) {
      const describedBy = await start.getAttribute('aria-describedby');
      expect(describedBy).toContain(alertId);
    }
  });

  test('champs toujours accessibles au clavier, focus visible, sans débordement — 3 viewports', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
      { width: 640, height: 720 },
    ]) {
      await page.setViewportSize(viewport);
      await goToPilotage(page);

      const start = page.locator('#pilotage-date-start');
      await expect(start).toBeEnabled();
      for (let index = 0; index < 80; index += 1) {
        if (await start.evaluate((el) => el === document.activeElement)) break;
        await page.keyboard.press('Tab');
      }
      await expect(start).toBeFocused();
      // .form-input utilise box-shadow (pas outline) comme indicateur de
      // focus visible — cf. .form-input:focus dans base.css.
      const boxShadow = await start.evaluate((el) => window.getComputedStyle(el).boxShadow);
      expect(boxShadow).not.toBe('none');

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflows, `viewport ${viewport.width}×${viewport.height}: pas de débordement`).toBe(
        false
      );
    }
  });

  test('accessibilité axe-core sur le filtre analytique', async ({ page }) => {
    await goToPilotage(page);
    const results = await new AxeBuilder({ page })
      .include('.pilotage-filter-card')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
