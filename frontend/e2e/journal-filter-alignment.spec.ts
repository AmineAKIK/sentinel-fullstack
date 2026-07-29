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

async function goToJournal(page: Page): Promise<void> {
  await loginAsResponsable(page);
  await page.goto('/workshop/journal');
  await expect(page.getByRole('heading', { name: 'Journal atelier' })).toBeVisible();
}

async function goToPilotage(page: Page): Promise<void> {
  await loginAsResponsable(page);
  await page.goto('/workshop/pilotage');
  await expect(page.getByRole('heading', { name: 'Pilotage atelier' })).toBeVisible();
}

test.describe('Journal — alignement visuel des filtres sur Pilotage (RC5)', () => {
  test('la hauteur du select "Toutes les actions" ne s’écarte pas de plus de 1px du select Pilotage', async ({
    page,
  }) => {
    await goToPilotage(page);
    const pilotagePeriodHeight = await page
      .getByRole('combobox', { name: 'Période' })
      .evaluate((el) => el.getBoundingClientRect().height);

    await goToJournal(page);
    const journalSelectHeight = await page
      .getByLabel("Filtrer par type d'action")
      .evaluate((el) => el.getBoundingClientRect().height);

    expect(Math.abs(journalSelectHeight - pilotagePeriodHeight)).toBeLessThanOrEqual(1);
  });

  test('la hauteur des champs date ne s’écarte pas de plus de 1px des dates Pilotage', async ({
    page,
  }) => {
    await goToPilotage(page);
    const pilotageDateHeight = await page
      .locator('#pilotage-date-start')
      .evaluate((el) => el.getBoundingClientRect().height);

    await goToJournal(page);
    const journalStartHeight = await page
      .getByLabel('Depuis le')
      .evaluate((el) => el.getBoundingClientRect().height);
    const journalEndHeight = await page
      .getByLabel("Jusqu'au")
      .evaluate((el) => el.getBoundingClientRect().height);

    expect(Math.abs(journalStartHeight - pilotageDateHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(journalEndHeight - pilotageDateHeight)).toBeLessThanOrEqual(1);
  });

  test('les champs date portent la classe canonique form-input', async ({ page }) => {
    await goToJournal(page);
    const startClass = await page.getByLabel('Depuis le').getAttribute('class');
    const endClass = await page.getByLabel("Jusqu'au").getAttribute('class');
    expect(startClass ?? '').toMatch(/\bform-input\b/);
    expect(endClass ?? '').toMatch(/\bform-input\b/);
  });

  test('les champs Action, Début et Fin ont des libellés visibles (pas seulement aria-label)', async ({
    page,
  }) => {
    await goToJournal(page);
    // "Action" est ambigu avec l'en-tête de tri du tableau : on cible le
    // label réellement associé au select via son attribut `for`.
    await expect(page.locator('label[for="journal-event-filter"]')).toHaveText('Action');
    await expect(page.getByText('Début', { exact: true })).toBeVisible();
    await expect(page.getByText('Fin', { exact: true })).toBeVisible();
  });

  test('filtrage réel par borne de date met à jour le compteur', async ({ page }) => {
    await goToJournal(page);
    const countBefore = await page.locator('.history-event-count').textContent();
    expect(countBefore).toBeTruthy();

    const farFuture = '2099-01-01';
    await page.getByLabel('Depuis le').fill(farFuture);
    await expect(page.locator('.history-event-count')).toContainText('0 action');
  });

  test('Début > Fin affiche une erreur locale sans requête incohérente', async ({ page }) => {
    await goToJournal(page);
    await page.getByLabel('Depuis le').fill('2026-03-10');
    await page.getByLabel("Jusqu'au").fill('2026-03-01');

    await expect(page.getByRole('alert')).toContainText(
      'La date de début doit être antérieure à la date de fin.'
    );
  });

  test('Effacer les filtres réinitialise le type d’action et les deux dates', async ({ page }) => {
    await goToJournal(page);
    await page.getByLabel("Filtrer par type d'action").selectOption('INCIDENT_CLOSED');
    await page.getByLabel('Depuis le').fill('2026-03-01');
    await page.getByLabel("Jusqu'au").fill('2026-03-31');

    await page.getByRole('button', { name: 'Effacer les filtres' }).click();

    await expect(page.getByLabel("Filtrer par type d'action")).toHaveValue('all');
    await expect(page.getByLabel('Depuis le')).toHaveValue('');
    await expect(page.getByLabel("Jusqu'au")).toHaveValue('');
  });

  for (const viewport of [
    { name: 'desktop-1440x900', width: 1440, height: 900 },
    { name: 'mobile-390x844', width: 390, height: 844 },
    { name: 'zoom200-640x720', width: 640, height: 720 },
  ]) {
    test(`${viewport.name} : aucun débordement horizontal, champs non tronqués`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await goToJournal(page);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflows, `${viewport.name}: aucun débordement horizontal`).toBe(false);

      // Même hauteur tactile que le reste de l'application (.form-input,
      // partagée avec Pilotage) : pas de réduction sous ce plancher commun.
      const startHeight = await page
        .getByLabel('Depuis le')
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(startHeight).toBeGreaterThanOrEqual(40);
    });
  }

  test('focus clavier visible sur le champ Début', async ({ page }) => {
    await goToJournal(page);
    const start = page.getByLabel('Depuis le');
    for (let index = 0; index < 80; index += 1) {
      if (await start.evaluate((el) => el === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(start).toBeFocused();
    const boxShadow = await start.evaluate((el) => window.getComputedStyle(el).boxShadow);
    expect(boxShadow).not.toBe('none');
  });

  test('le calendrier natif reste ouvrable (aucun overlay ne bloque le champ)', async ({
    page,
  }) => {
    await goToJournal(page);
    const start = page.getByLabel('Depuis le');
    await start.click();
    await start.fill('2026-05-15');
    await expect(start).toHaveValue('2026-05-15');
  });

  test('accessibilité axe-core sur la barre de filtres du journal', async ({ page }) => {
    await goToJournal(page);
    const results = await new AxeBuilder({ page })
      .include('.history-event-filter')
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
