import { expect, test, type Page } from '@playwright/test';
import { E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

/**
 * Recette « zoom 200 % » (WCAG 2.1 SC 1.4.10 Reflow), lot 10. Un zoom navigateur
 * à 200 % réduit de moitié la largeur en pixels CSS disponibles. On l'émule en
 * fixant une largeur de fenêtre correspondant à la moitié d'un bureau standard
 * (1280 → 640) : le contenu doit se reformater sans imposer de défilement
 * horizontal de la page (aucune perte d'information ni de fonctionnalité).
 */

// 640×720 ≈ un bureau 1280×1440 vu à 200 %.
test.use({ viewport: { width: 640, height: 720 } });

async function loginAsResponsable(page: Page): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(E2E_RESPONSABLE_BADGE);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function expectNoHorizontalPageScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  // +1 px de tolérance pour l'arrondi sous-pixel.
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth + 1);
}

test.beforeEach(async ({ page }) => {
  await loginAsResponsable(page);
});

test('le dashboard atelier ne déborde pas horizontalement à 200 %', async ({ page }) => {
  await page.goto('/workshop/dashboard');
  await expect(page.locator('.incident-card').first()).toBeVisible();
  await expectNoHorizontalPageScroll(page);
});

test('le journal ne déborde pas horizontalement à 200 %', async ({ page }) => {
  await page.goto('/workshop/journal');
  await expectNoHorizontalPageScroll(page);
});

test('le dossier ouvert reste lisible et sans débordement à 200 %', async ({ page }) => {
  await page.goto('/workshop/dashboard');
  const card = page.locator('.incident-card').first();
  await expect(card).toBeVisible();
  await card.locator('.incident-card-open').click();

  const dossier = page.locator('.incident-detail-drawer');
  await expect(dossier).toBeVisible();
  // Le titre du dossier est visible (le panneau s'est bien ouvert)…
  await expect(dossier.locator('.incident-detail-title')).toBeVisible();
  // …et la page ne défile pas horizontalement.
  await expectNoHorizontalPageScroll(page);
});
