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

function journalEvent(id: number, machineId: string, eventType = 'INCIDENT_TAKEN') {
  return {
    id,
    incident_id: id,
    event_type: eventType,
    payload: null,
    created_at: `2026-03-${String(id).padStart(2, '0')}T10:00:00.000Z`,
    line_id: id,
    line_number: '901',
    machine_id: machineId,
    robot_label: `R-${id}`,
    head_number: 1,
    current_state: 'DEGRADEE',
    current_status: 'OPEN',
    first_name: 'Eden',
    last_name: 'AKIK',
    role: 'RESPONSABLE',
    badge_number: 'RE-01',
  };
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
      .getByLabel('Début')
      .evaluate((el) => el.getBoundingClientRect().height);
    const journalEndHeight = await page
      .getByLabel('Fin')
      .evaluate((el) => el.getBoundingClientRect().height);

    expect(Math.abs(journalStartHeight - pilotageDateHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(journalEndHeight - pilotageDateHeight)).toBeLessThanOrEqual(1);
  });

  test('les champs date portent la classe canonique form-input', async ({ page }) => {
    await goToJournal(page);
    const startClass = await page.getByLabel('Début').getAttribute('class');
    const endClass = await page.getByLabel('Fin').getAttribute('class');
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
    await page.getByLabel('Début').fill(farFuture);
    await expect(page.locator('.history-event-count')).toContainText('0 action');
  });

  test('Début > Fin affiche une erreur locale sans requête incohérente', async ({ page }) => {
    await goToJournal(page);
    await page.getByLabel('Début').fill('2026-03-10');
    await page.getByLabel('Fin').fill('2026-03-01');

    await expect(page.getByRole('alert')).toContainText(
      'La date de début doit être antérieure à la date de fin.'
    );
  });

  test('Effacer les filtres réinitialise le type d’action et les deux dates', async ({ page }) => {
    await goToJournal(page);
    await page.getByLabel("Filtrer par type d'action").selectOption('INCIDENT_CLOSED');
    await page.getByLabel('Début').fill('2026-03-01');
    await page.getByLabel('Fin').fill('2026-03-31');

    await page.getByRole('button', { name: 'Effacer les filtres' }).click();

    await expect(page.getByLabel("Filtrer par type d'action")).toHaveValue('all');
    await expect(page.getByLabel('Début')).toHaveValue('');
    await expect(page.getByLabel('Fin')).toHaveValue('');
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
        .getByLabel('Début')
        .evaluate((el) => el.getBoundingClientRect().height);
      expect(startHeight).toBeGreaterThanOrEqual(40);
    });
  }

  test('focus clavier visible sur le champ Début', async ({ page }) => {
    await goToJournal(page);
    const start = page.getByLabel('Début');
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
    const start = page.getByLabel('Début');
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

test.describe('Journal — contrats terminaux RC5', () => {
  test('RC5-AUD-06 — Début et Fin gardent leur nom visible, le focus clavier et un état axe vert', async ({
    page,
  }) => {
    await goToJournal(page);
    const start = page.getByLabel('Début');
    const end = page.getByLabel('Fin');
    await expect(start).toHaveAccessibleName('Début');
    await expect(end).toHaveAccessibleName('Fin');

    for (let index = 0; index < 80; index += 1) {
      if (await start.evaluate((element) => element === document.activeElement)) break;
      await page.keyboard.press('Tab');
    }
    await expect(start).toBeFocused();
    expect(await start.evaluate((element) => window.getComputedStyle(element).boxShadow)).not.toBe(
      'none'
    );
    await page.keyboard.press('Tab');
    await expect(end).toBeFocused();
    expect(await end.evaluate((element) => window.getComputedStyle(element).boxShadow)).not.toBe(
      'none'
    );

    const results = await new AxeBuilder({ page })
      .include('.history-event-filter')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('RC5-AUD-02 — une suite annulée ne bloque ni ne remplace le résultat du nouveau filtre', async ({
    page,
  }) => {
    await loginAsResponsable(page);

    let markContinuationStarted!: () => void;
    const continuationStarted = new Promise<void>((resolve) => {
      markContinuationStarted = resolve;
    });
    let releaseContinuation!: () => void;
    const continuationGate = new Promise<void>((resolve) => {
      releaseContinuation = resolve;
    });
    let markContinuationSettled!: () => void;
    const continuationSettled = new Promise<void>((resolve) => {
      markContinuationSettled = resolve;
    });
    const requestedUrls: URL[] = [];

    await page.route('**/api/workshop/history/events**', async (route) => {
      const url = new URL(route.request().url());
      requestedUrls.push(url);
      const cursor = url.searchParams.get('cursor');
      const eventType = url.searchParams.get('eventType');

      if (cursor === 'cursor-old-page-2') {
        markContinuationStarted();
        await continuationGate;
        try {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              items: [journalEvent(9, 'RC5-STALE')],
              nextCursor: null,
            }),
          });
        } catch {
          // L'abort navigateur attendu peut fermer la route avant son déblocage.
        } finally {
          markContinuationSettled();
        }
        return;
      }

      if (eventType === 'INCIDENT_CLOSED') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            items: [journalEvent(2, 'RC5-NEW', 'INCIDENT_CLOSED')],
            nextCursor: 'cursor-new-page-2',
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [journalEvent(1, 'RC5-OLD')],
          nextCursor: 'cursor-old-page-2',
        }),
      });
    });

    await page.goto('/workshop/journal');
    await expect(page.getByRole('heading', { name: 'Journal atelier' })).toBeVisible();
    await expect(page.locator('.history-journal-table')).toContainText('RC5-OLD');

    await page.getByRole('button', { name: 'Charger la suite' }).click();
    await continuationStarted;
    await page.locator('#journal-event-filter').selectOption('INCIDENT_CLOSED');

    await expect.poll(() => new URL(page.url()).searchParams.get('event')).toBe('INCIDENT_CLOSED');
    await expect(page.locator('.history-journal-table')).toContainText('RC5-NEW');
    await expect(page.locator('.history-journal-table')).not.toContainText('RC5-OLD');
    await expect(page.locator('.history-journal-table')).not.toContainText('RC5-STALE');
    await expect(page.getByRole('button', { name: 'Charger la suite' })).toBeEnabled();
    expect(
      requestedUrls.some(
        (url) =>
          url.searchParams.get('eventType') === 'INCIDENT_CLOSED' && !url.searchParams.has('cursor')
      )
    ).toBe(true);

    releaseContinuation();
    await continuationSettled;
    await expect(page.locator('.history-journal-table')).toContainText('RC5-NEW');
    await expect(page.locator('.history-journal-table')).not.toContainText('RC5-STALE');
  });

  test('RC5-AUD-03 — les URL hostiles, répétées ou inversées sont remplacées sans requête invalide', async ({
    page,
  }) => {
    await loginAsResponsable(page);
    const pageErrors: Error[] = [];
    const eventRequests: URL[] = [];
    page.on('pageerror', (error) => pageErrors.push(error));
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/workshop/history/events') eventRequests.push(url);
    });

    const canonicalRepeated = '/workshop/journal?q=hostile&status=CLOSED&end=2026-01-31';
    await page.goto(
      '/workshop/journal?q=hostile&status=CLOSED&start=2026-01-01&start=%3Cscript%3Ealert%281%29%3C%2Fscript%3E&end=2026-01-31'
    );
    await expect(page.getByRole('heading', { name: 'Journal atelier' })).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe(canonicalRepeated);
    await expect(page.locator('#journal-date-start')).toHaveValue('');
    await expect(page.locator('#journal-date-end')).toHaveValue('2026-01-31');
    await expect(page.locator('.history-event-count')).not.toContainText('Chargement');

    const canonicalInverted = '/workshop/journal?q=inversee&status=OPEN';
    await page.goto('/workshop/journal?q=inversee&status=OPEN&start=2026-03-10&end=2026-03-01');
    await expect(page.getByRole('heading', { name: 'Journal atelier' })).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe(canonicalInverted);
    await expect(page.locator('#journal-date-start')).toHaveValue('');
    await expect(page.locator('#journal-date-end')).toHaveValue('');
    await expect(page.locator('.history-event-count')).not.toContainText('Chargement');

    await page.goBack();
    await expect
      .poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe(canonicalRepeated);
    await page.goForward();
    await expect
      .poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe(canonicalInverted);

    expect(pageErrors).toEqual([]);
    expect(eventRequests.length).toBeGreaterThan(0);
    for (const requestUrl of eventRequests) {
      const startValues = requestUrl.searchParams.getAll('start');
      const endValues = requestUrl.searchParams.getAll('end');
      expect(startValues.length).toBeLessThanOrEqual(1);
      expect(endValues.length).toBeLessThanOrEqual(1);
      if (startValues[0]) expect(Number.isNaN(Date.parse(startValues[0]))).toBe(false);
      if (endValues[0]) expect(Number.isNaN(Date.parse(endValues[0]))).toBe(false);
      if (startValues[0] && endValues[0]) {
        expect(Date.parse(startValues[0])).toBeLessThanOrEqual(Date.parse(endValues[0]));
      }
    }
    const expectedEndIso = await page.evaluate(() =>
      new Date('2026-01-31T23:59:59.999').toISOString()
    );
    expect(
      eventRequests.some((requestUrl) => requestUrl.searchParams.get('end') === expectedEndIso)
    ).toBe(true);
  });
});
