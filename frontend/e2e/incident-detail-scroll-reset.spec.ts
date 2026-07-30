import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_OPERATOR_BADGE, E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

test.describe.configure({ retries: 0 });

async function loginAsWorkshop(page: Page, badge: string): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(badge);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
  await expect(page.locator('article.incident-card').first()).toBeVisible();
}

async function loginAsOperator(page: Page): Promise<void> {
  await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
}

async function loginAsResponsable(page: Page): Promise<void> {
  await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
}

async function nextPaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      })
  );
}

async function openCardByProduct(page: Page, product: string): Promise<void> {
  const card = page.locator('article.incident-card', { hasText: product });
  await card.scrollIntoViewIfNeeded();
  await card.locator('.incident-card-meta').click();
  await expect(page.locator('aside.incident-detail-drawer')).toBeVisible();
  await expectDossierShowsProduct(page, product);
}

// Le titre du dossier (ligne + machine) est identique pour les fixtures
// E2E-SCROLL-* : seul le produit en cours les distingue réellement.
async function expectDossierShowsProduct(page: Page, product: string): Promise<void> {
  await expect(
    page.locator('.incident-detail-content').getByText(product, { exact: true })
  ).toBeVisible();
}

async function scrollBodyRealWheel(page: Page): Promise<number> {
  const body = page.locator('.incident-detail-content');
  const bodyBox = await body.boundingBox();
  expect(bodyBox).not.toBeNull();
  await page.mouse.move(
    bodyBox!.x + bodyBox!.width / 2,
    bodyBox!.y + Math.min(bodyBox!.height / 2, 200)
  );
  await page.mouse.wheel(0, 240);
  await nextPaint(page);
  const scrollTop = await body.evaluate((el) => el.scrollTop);
  expect(
    scrollTop,
    'la molette doit avoir produit un scroll interne strictement positif'
  ).toBeGreaterThan(0);
  return scrollTop;
}

async function readBodyScrollTop(page: Page): Promise<number> {
  return page.locator('.incident-detail-content').evaluate((el) => el.scrollTop);
}

async function readPageScrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

test.describe('Dossier incident — reset du scroll interne à la sélection (RC5)', () => {
  test('carte vers carte : scrollTop revient à 0, window.scrollY ne bouge pas', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loginAsOperator(page);

    await openCardByProduct(page, 'E2E-SCROLL-08');
    await scrollBodyRealWheel(page);
    const pageScrollYBefore = await readPageScrollY(page);

    // Tête 9 est adjacente à tête 8 dans le tri (display_order croissant du
    // seed) : la carte reste dans le viewport initial, aucun scroll de page
    // n'est nécessaire pour l'atteindre — la mesure de window.scrollY porte
    // donc exclusivement sur l'effet du changement de sélection.
    const nextCard = page.locator('article.incident-card', { hasText: 'E2E-SCROLL-09' });
    await expect(nextCard).toBeInViewport();
    await nextCard.locator('.incident-card-meta').click();
    await expectDossierShowsProduct(page, 'E2E-SCROLL-09');

    expect(await readBodyScrollTop(page)).toBe(0);
    expect(await readPageScrollY(page)).toBe(pageScrollYBefore);
  });

  test('flèche suivant puis précédent : scrollTop revient à 0 à chaque changement', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loginAsOperator(page);

    await openCardByProduct(page, 'E2E-SCROLL-08');
    await scrollBodyRealWheel(page);

    const nextButton = page.getByRole('button', { name: 'Incident suivant' });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();
    await expect(page.locator('.incident-detail-content')).not.toContainText('E2E-SCROLL-08');
    expect(await readBodyScrollTop(page)).toBe(0);

    await scrollBodyRealWheel(page);

    const prevButton = page.getByRole('button', { name: 'Incident précédent' });
    await expect(prevButton).toBeEnabled();
    await prevButton.click();
    await expectDossierShowsProduct(page, 'E2E-SCROLL-08');
    expect(await readBodyScrollTop(page)).toBe(0);
  });

  test('historique navigateur : retour puis aller remettent scrollTop à 0', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loginAsOperator(page);

    await openCardByProduct(page, 'E2E-SCROLL-08');
    await openCardByProduct(page, 'E2E-SCROLL-09');
    await scrollBodyRealWheel(page);

    await page.goBack();
    await expectDossierShowsProduct(page, 'E2E-SCROLL-08');
    expect(await readBodyScrollTop(page)).toBe(0);

    await scrollBodyRealWheel(page);

    await page.goForward();
    await expectDossierShowsProduct(page, 'E2E-SCROLL-09');
    expect(await readBodyScrollTop(page)).toBe(0);
  });

  test('fermeture puis réouverture du même dossier : scrollTop revient à 0', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loginAsOperator(page);

    await openCardByProduct(page, 'E2E-SCROLL-08');
    await scrollBodyRealWheel(page);

    await page.getByRole('button', { name: 'Fermer le détail' }).click();
    await expect(page.locator('aside.incident-detail-drawer')).toHaveCount(0);

    await openCardByProduct(page, 'E2E-SCROLL-08');
    expect(await readBodyScrollTop(page)).toBe(0);
  });

  test('même incident : un refetch/mutation ne réinitialise pas la position de scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loginAsResponsable(page);

    await openCardByProduct(page, 'E2E-SCROLL-08');
    const scrollTopBefore = await scrollBodyRealWheel(page);

    // Suivre/retirer le suivi mute l'incident affiché sans changer son id —
    // couvre le cas "même incident, données évoluent" (refetch/mutation).
    const followButton = page.locator('.incident-detail-followbtn');
    await expect(followButton).toBeVisible();
    await followButton.click();
    await expect(page.getByRole('status')).toBeVisible();

    await expectDossierShowsProduct(page, 'E2E-SCROLL-08');
    const scrollTopAfter = await readBodyScrollTop(page);
    expect(scrollTopAfter).toBe(scrollTopBefore);
  });

  for (const viewport of [
    { name: 'desktop-1440x900', width: 1440, height: 900 },
    { name: 'mobile-390x844', width: 390, height: 844 },
    { name: 'zoom200-640x720', width: 640, height: 720 },
  ]) {
    test(`${viewport.name} : reset au changement de sélection sans débordement, en-tête visible, axe-core propre`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await loginAsOperator(page);

      await openCardByProduct(page, 'E2E-SCROLL-08');
      await scrollBodyRealWheel(page);

      // Sous 1180px, la liste est masquée pendant que le panneau est ouvert
      // (.workshop-results-list-pane en visibility:hidden) : le changement de
      // sélection passe par les flèches précédent/suivant, pas par un second
      // clic de carte — comportement de layout normal, pas un bug.
      const nextButton = page.getByRole('button', { name: 'Incident suivant' });
      await expect(nextButton).toBeEnabled();
      await nextButton.click();
      await expect(page.locator('.incident-detail-content')).not.toContainText('E2E-SCROLL-08');
      expect(await readBodyScrollTop(page)).toBe(0);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflows, `${viewport.name}: aucun débordement horizontal`).toBe(false);

      await expect(page.locator('.incident-detail-title')).toBeVisible();

      // Le scroll interne doit rester fonctionnel après le reset.
      const scrollTopAfterSecondWheel = await scrollBodyRealWheel(page);
      expect(scrollTopAfterSecondWheel).toBeGreaterThan(0);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical'
      );
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
    });
  }
});
