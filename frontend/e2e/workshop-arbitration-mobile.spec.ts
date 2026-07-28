import { expect, test, type Locator, type Page } from '@playwright/test';
import { E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

test.use({ viewport: { width: 393, height: 851 } });

async function loginAsResponsable(page: Page): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(E2E_RESPONSABLE_BADGE);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function expectCompactModal(page: Page, dialog: Locator): Promise<void> {
  await expect(dialog).toBeVisible();
  const viewport = page.viewportSize();
  const box = await dialog.boundingBox();
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);

  const dialogOverflow = await dialog.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dialogOverflow.scrollHeight).toBeLessThanOrEqual(dialogOverflow.clientHeight + 1);
  expect(await page.evaluate(() => document.body.style.position)).toBe('fixed');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    viewport!.width + 1
  );

  const footerButtons = dialog.locator('.modal-footer button:visible');
  const count = await footerButtons.count();
  expect(count).toBeGreaterThanOrEqual(3);
  for (let index = 0; index < count; index += 1) {
    const buttonBox = await footerButtons.nth(index).boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.height).toBeGreaterThanOrEqual(32);
    expect(buttonBox!.height).toBeLessThanOrEqual(52);
  }
}

test.beforeEach(async ({ page }) => {
  await loginAsResponsable(page);
});

test('reporter conserve l’arbitrage actif et ouvre le dossier mobile en haut', async ({ page }) => {
  const card = page.locator('.incident-card').filter({ hasText: 'E2E-ANNULATION' });
  await expect(card).toBeVisible();
  // RC4 : l'activateur natif couvre toute la zone non interactive de la carte.
  const cardActivationArea = card.getByRole('link', { name: /Ouvrir incident/i });
  await cardActivationArea.click();

  const dialog = page.getByRole('dialog', { name: 'Arbitrage annulation' });
  await expectCompactModal(page, dialog);
  await dialog.getByRole('button', { name: 'Reporter' }).click();
  await expect(dialog).toBeHidden();

  const dossier = page.getByLabel(/Détail de l'incident ligne 999, machine E2E-MCH-1/);
  await expect(dossier).toBeVisible();
  const dossierBox = await dossier.boundingBox();
  const navigationBox = await page.getByRole('navigation').boundingBox();
  expect(dossierBox).not.toBeNull();
  expect(navigationBox).not.toBeNull();
  expect(dossierBox!.y).toBeLessThanOrEqual(navigationBox!.y + navigationBox!.height + 36);
  expect(await dossier.evaluate((element) => element.scrollTop)).toBe(0);
  expect(page.url()).toContain('incident=');

  await dossier.getByRole('button', { name: 'Fermer le détail' }).click();
  await cardActivationArea.click();
  await expect(page.getByRole('dialog', { name: 'Arbitrage annulation' })).toBeVisible();
});

test('la correction se décide directement depuis le modal mobile', async ({ page }) => {
  const card = page.locator('.incident-card').filter({ hasText: 'E2E-CORRECTION' });
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: /Ouvrir incident/i }).click();

  const dialog = page.getByRole('dialog', { name: 'Arbitrage correction' });
  await expectCompactModal(page, dialog);
  await dialog.getByRole('button', { name: 'Appliquer la correction' }).click();

  await expect(dialog).toBeHidden();
  await expect(card.getByText(/Correction (demandée|en attente)/)).toHaveCount(0);
});
