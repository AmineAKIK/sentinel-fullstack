import { expect, test, type Page } from '@playwright/test';
import { E2E_OPERATOR_BADGE, E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

async function loginAsWorkshop(page: Page, badge: string): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(badge);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

test('ouvre le dossier depuis la métadonnée produit de la carte', async ({ page }) => {
  await loginAsWorkshop(page, E2E_OPERATOR_BADGE);

  const card = page.locator('article', { hasText: 'E2E-CORRECTION' });
  const productMetadata = card
    .locator('.incident-card-meta')
    .getByText('E2E-CORRECTION', { exact: true });
  await expect(productMetadata).toBeVisible();

  const metadataBox = await productMetadata.boundingBox();
  expect(metadataBox).not.toBeNull();
  await page.mouse.click(
    metadataBox!.x + metadataBox!.width / 2,
    metadataBox!.y + metadataBox!.height / 2
  );

  const dossier = page.getByLabel(/Détail de l'incident ligne 999, machine E2E-MCH-1/);
  await expect(dossier).toBeVisible();
  await expect(dossier.getByText('E2E-CORRECTION', { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/(?:\?|&)incident=\d+(?:&|$)/);
});

test('affiche un focus visible sur l’activateur atteint au clavier', async ({ page }) => {
  await loginAsWorkshop(page, E2E_OPERATOR_BADGE);

  const card = page.locator('article', { hasText: 'E2E-CORRECTION' });
  const activationArea = card.getByRole('link', { name: /Ouvrir incident/i });
  await expect(activationArea).toBeVisible();

  for (let index = 0; index < 80; index += 1) {
    if (await activationArea.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }

  await expect(activationArea).toBeFocused();
  const focusStyle = await activationArea.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusStyle.outlineStyle).not.toBe('none');
  expect(focusStyle.outlineWidth).toBeGreaterThan(0);
});

test('garde l’étoile et l’arbitrage indépendants de l’ouverture du dossier', async ({ page }) => {
  await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);

  const card = page.locator('article', { hasText: 'E2E-CORRECTION' });
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: 'Suivre cet incident' }).click();
  await expect(page.locator('.incident-detail-drawer')).toHaveCount(0);
  await expect(page).not.toHaveURL(/(?:\?|&)incident=\d+(?:&|$)/);

  await card.getByRole('button', { name: 'Modification à arbitrer' }).click();
  await expect(page.getByRole('dialog', { name: 'Arbitrage correction' })).toBeVisible();
  await expect(page.locator('.incident-detail-drawer')).toHaveCount(0);
  await expect(page).not.toHaveURL(/(?:\?|&)incident=\d+(?:&|$)/);
});
