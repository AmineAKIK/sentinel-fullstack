import { expect, test, type Page } from '@playwright/test';
import { E2E_MAINTENANCE_BADGE, E2E_OPERATOR_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

async function loginAsWorkshop(page: Page, badge: string): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(badge);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

// SelectField est un combobox ARIA custom (bouton + listbox), pas un <select>
// natif : selectOption() ne s'applique pas, il faut ouvrir puis cliquer l'option.
async function chooseSelectField(page: Page, ariaLabel: string, optionText: string | RegExp) {
  await page.getByRole('combobox', { name: ariaLabel }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

test('cycle de vie complet d’un incident : création → prise en charge → suspension → reprise → clôture', async ({
  page,
  browser,
}) => {
  const productRef = `E2E-CYCLE-${Date.now()}`;

  // --- Étape 1 : l'opérateur crée l'incident ---------------------------------
  await loginAsWorkshop(page, E2E_OPERATOR_BADGE);

  await page.getByRole('button', { name: '+ Créer un incident' }).click();
  await chooseSelectField(page, 'Ligne', '999');
  await chooseSelectField(page, 'Machine', /E2E-MCH-1/);
  await chooseSelectField(page, 'Robot', '1');
  await chooseSelectField(page, 'Tête', '5');
  await chooseSelectField(page, 'État', 'Dégradée');
  await page.getByPlaceholder('Référence produit').fill(productRef);
  await page.getByRole('button', { name: 'Aperçu' }).click();
  await expect(page.getByText("Aperçu de l'incident")).toBeVisible();
  await page.getByRole('button', { name: 'Valider la création' }).click();

  const card = page.locator('article', { hasText: productRef }).locator('.incident-card-open');
  await expect(card).toBeVisible();
  await card.click();

  const panel = page.locator('aside.incident-detail-drawer');
  await expect(panel.getByText(productRef)).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le détail' }).click();

  // --- Étape 2 : le technicien prend en charge, suspend, reprend et clôture --
  const maintenanceContext = await browser.newContext();
  const maintenancePage = await maintenanceContext.newPage();
  await loginAsWorkshop(maintenancePage, E2E_MAINTENANCE_BADGE);

  const maintenanceCard = maintenancePage
    .locator('article', { hasText: productRef })
    .locator('.incident-card-open');
  await expect(maintenanceCard).toBeVisible();
  await maintenanceCard.click();

  await maintenancePage.getByRole('button', { name: 'Prendre en charge' }).click();
  await maintenancePage.getByRole('button', { name: 'Confirmer' }).click();
  await expect(maintenancePage.getByRole('button', { name: 'Suspendre' })).toBeVisible();

  await maintenancePage.getByRole('button', { name: 'Suspendre' }).click();
  // Terminologie RC3 lot 7/9 : « Motif de mise en attente » (plus « Justification »).
  await maintenancePage
    .getByLabel('Motif de mise en attente *')
    .fill('Attente pièce détachée (E2E).');
  await maintenancePage.getByRole('button', { name: 'Suspendre', exact: true }).last().click();
  await expect(maintenancePage.getByRole('button', { name: 'Reprendre' })).toBeVisible();

  await maintenancePage.getByRole('button', { name: 'Reprendre' }).click();
  await maintenancePage.getByRole('button', { name: 'Confirmer' }).click();
  await expect(maintenancePage.getByRole('button', { name: 'Clôturer' })).toBeVisible();

  await maintenancePage.getByRole('button', { name: 'Clôturer' }).click();
  await maintenancePage
    .getByPlaceholder("Décrivez l'intervention réalisée")
    .fill('Pièce remplacée, incident résolu (E2E).');
  await maintenancePage.getByRole('button', { name: 'Clôturer', exact: true }).last().click();

  const closedPanel = maintenancePage.locator('aside.incident-detail-drawer');
  await expect(closedPanel.getByText('Clôturé')).toBeVisible();
  await expect(
    maintenancePage.getByRole('button', { name: 'Prendre en charge' })
  ).not.toBeVisible();
  await expect(maintenancePage.getByRole('button', { name: 'Clôturer' })).not.toBeVisible();

  await maintenanceContext.close();
});
