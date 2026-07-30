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
  // Période "Aujourd'hui" garantit au moins un jour de trend non nul, puisque
  // le seed E2E crée ses incidents de la ligne 999 à l'exécution du seed.
  await chooseSelectField(page, 'Période', "Aujourd'hui");
  await expect(page.getByText('Chargement des indicateurs…')).toHaveCount(0);
}

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablette-768', width: 768, height: 1024 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-325', width: 325, height: 844 },
  { name: 'zoom200-640', width: 640, height: 720 },
];

test.describe('Pilotage — géométrie responsive KPI, répartitions, tendance (RC5)', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} : le KPI "Incidents actifs" reste un bloc atomique lisible`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await goToPilotage(page);

      const kpi = page.locator('.pilotage-hero-stat').first();
      await expect(kpi).toBeVisible();
      const valueEl = kpi.locator('.pilotage-hero-stat-value');
      await expect(valueEl).toBeVisible();

      const geometry = await valueEl.evaluate((el) => {
        const rects = Array.from(el.getClientRects());
        return {
          text: el.textContent,
          rectCount: rects.length,
          overflowsHorizontally: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      await test.info().attach(`kpi-geometry-${viewport.name}`, {
        body: JSON.stringify(geometry, null, 2),
        contentType: 'application/json',
      });

      // Un bloc de texte numérique atomique ne doit produire qu'un seul
      // rectangle client (aucun retour à la ligne interne, aucune coupure).
      expect(
        geometry.rectCount,
        `${viewport.name}: la valeur KPI "${geometry.text}" ne doit pas être coupée en plusieurs lignes`
      ).toBe(1);
      expect(
        geometry.overflowsHorizontally,
        `${viewport.name}: pas de débordement horizontal`
      ).toBe(false);
    });

    test(`${viewport.name} : les répartitions par périmètre gardent une barre de proportion visible`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await goToPilotage(page);

      const ranking = page.locator('.pilotage-ranking-row').first();
      await expect(ranking).toBeVisible();
      const bar = ranking.locator('.pilotage-ranking-bar');
      await expect(bar, `${viewport.name}: barre de proportion présente`).toBeVisible();

      const geometry = await bar.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const fill = el.querySelector('i');
        const fillRect = fill?.getBoundingClientRect();
        return {
          barWidth: rect.width,
          barHeight: rect.height,
          fillWidth: fillRect?.width ?? 0,
        };
      });
      await test.info().attach(`ranking-bar-geometry-${viewport.name}`, {
        body: JSON.stringify(geometry, null, 2),
        contentType: 'application/json',
      });

      expect(geometry.barWidth, `${viewport.name}: piste de proportion non nulle`).toBeGreaterThan(
        0
      );
      expect(
        geometry.fillWidth,
        `${viewport.name}: remplissage de proportion non nul`
      ).toBeGreaterThan(0);
    });

    test(`${viewport.name} : le graphique créations/clôtures affiche des barres visibles avec des données non nulles`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await goToPilotage(page);

      const trendCard = page.locator('.pilotage-trend-card');
      await expect(trendCard).toBeVisible();

      const bars = trendCard.locator('.pilotage-trend-bar-created, .pilotage-trend-bar-closed');
      await expect(
        bars.first(),
        `${viewport.name}: au moins une barre de tendance visible`
      ).toBeVisible();

      const geometries = await bars.evaluateAll((elements) =>
        elements.map((el) => {
          const rect = el.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        })
      );
      await test.info().attach(`trend-bars-geometry-${viewport.name}`, {
        body: JSON.stringify(geometries, null, 2),
        contentType: 'application/json',
      });

      const positiveHeightBars = geometries.filter((g) => g.height > 0 && g.width > 0);
      expect(
        positiveHeightBars.length,
        `${viewport.name}: au moins une barre avec largeur et hauteur strictement positives`
      ).toBeGreaterThan(0);

      // Légende et dates lisibles.
      await expect(trendCard.getByText('Créés', { exact: true })).toBeVisible();
      await expect(trendCard.getByText('Clôturés', { exact: true })).toBeVisible();

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflows, `${viewport.name}: aucun débordement horizontal du document`).toBe(false);
    });
  }

  test('desktop 1440×900 : le tracé créations/clôtures utilise une part significative de sa largeur', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await goToPilotage(page);
    // Période plus longue pour obtenir plusieurs colonnes réelles si le seed
    // a produit des incidents sur plusieurs jours ; sinon le test reste
    // valide avec une seule colonne (le ratio est alors 100% du tracé utile).
    await chooseSelectField(page, 'Période', '30 derniers jours');
    await expect(page.getByText('Chargement des indicateurs…')).toHaveCount(0);

    const scrollArea = page.locator('.pilotage-trend-scroll');
    await expect(scrollArea).toBeVisible();
    const cols = page.locator('.pilotage-trend-col');
    await expect(cols.first()).toBeVisible();
    const colCount = await cols.count();

    const geometry = await scrollArea.evaluate((scrollEl) => {
      const scrollRect = scrollEl.getBoundingClientRect();
      const cols = Array.from(scrollEl.querySelectorAll('.pilotage-trend-col'));
      const first = cols[0]?.getBoundingClientRect();
      const last = cols[cols.length - 1]?.getBoundingClientRect();
      return {
        scrollWidth: scrollRect.width,
        spanUsed: first && last ? last.right - first.left : 0,
      };
    });
    await test.info().attach('trend-desktop-span', {
      body: JSON.stringify(geometry, null, 2),
      contentType: 'application/json',
    });

    if (colCount > 1) {
      const ratio = geometry.spanUsed / geometry.scrollWidth;
      expect(
        ratio,
        `le tracé doit utiliser une part significative de sa largeur (mesuré ${(ratio * 100).toFixed(1)}%)`
      ).toBeGreaterThan(0.3);
    }
  });

  test('période longue : le tracé reste défilable horizontalement sans réduire les barres à une largeur nulle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await goToPilotage(page);
    await chooseSelectField(page, 'Période', '30 derniers jours');
    await expect(page.getByText('Chargement des indicateurs…')).toHaveCount(0);

    const overflowsDocument = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflowsDocument, 'le document complet ne doit jamais déborder horizontalement').toBe(
      false
    );

    const cols = page.locator('.pilotage-trend-col');
    await expect(cols.first()).toBeVisible();
    const widths = await cols.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const width of widths) {
      expect(width, 'aucune colonne ne doit être réduite à une largeur nulle').toBeGreaterThan(0);
    }
  });

  test('état sans données : la carte affiche un message explicite, jamais une carte blanche vide', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsResponsable(page);
    await page.goto('/workshop/pilotage');
    await expect(page.getByRole('heading', { name: 'Pilotage atelier' })).toBeVisible();
    // Filtrer sur une ligne sans incident dans la période la plus courte pour
    // forcer un périmètre vide, sans fabriquer de données.
    await chooseSelectField(page, 'Ligne', '998');
    await chooseSelectField(page, 'Période', "Aujourd'hui");
    await expect(page.getByText('Chargement des indicateurs…')).toHaveCount(0);

    await expect(
      page.getByText('Aucun incident sur cette période — ajustez les filtres.')
    ).toBeVisible();
  });

  test('mobile 390×844 et desktop 1440×900 : accessibilité axe-core sans violation sérieuse', async ({
    page,
  }) => {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await goToPilotage(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    }
  });
});
