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
  const createDialog = page.getByRole('dialog', { name: "Aperçu de l'incident" });
  const createButton = createDialog.getByRole('button', { name: 'Valider la création' });
  const createRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/workshop/incidents')) {
      createRequests.push(request.url());
    }
  });
  const createBox = await createButton.boundingBox();
  expect(createBox).not.toBeNull();
  await page.mouse.dblclick(
    createBox!.x + createBox!.width / 2,
    createBox!.y + createBox!.height / 2
  );
  await expect(page.getByRole('status')).toContainText('Incident signalé.');
  expect(createRequests).toHaveLength(1);

  const card = page.locator('article', { hasText: productRef });
  const cardActivationArea = card.getByRole('link', { name: /Ouvrir incident/i });
  await expect(cardActivationArea).toBeVisible();
  await cardActivationArea.click();

  const panel = page.locator('aside.incident-detail-drawer');
  await expect(panel.getByText(productRef)).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le détail' }).click();

  // --- Étape 2 : le technicien prend en charge, suspend, reprend et clôture --
  const maintenanceContext = await browser.newContext();
  const maintenancePage = await maintenanceContext.newPage();
  await loginAsWorkshop(maintenancePage, E2E_MAINTENANCE_BADGE);

  const maintenanceCard = maintenancePage.locator('article', { hasText: productRef });
  const maintenanceCardActivationArea = maintenanceCard.getByRole('link', {
    name: /Ouvrir incident/i,
  });
  await expect(maintenanceCardActivationArea).toBeVisible();
  await maintenanceCardActivationArea.click();

  await maintenancePage.getByRole('button', { name: 'Prendre en charge' }).click();
  await maintenancePage.getByRole('button', { name: 'Confirmer' }).click();
  await expect(maintenancePage.getByRole('status')).toContainText('Prise en charge enregistrée.');
  await expect(maintenancePage.getByRole('button', { name: 'Suspendre' })).toBeVisible();

  await maintenancePage.getByRole('button', { name: 'Suspendre' }).click();
  // Terminologie RC3 lot 7/9 : « Motif de mise en attente » (plus « Justification »).
  const pendingDialog = maintenancePage.getByRole('dialog', {
    name: "Suspendre l'incident",
  });
  const waitingDraft = '  Attente pièce détachée (E2E).\nContrôle\tqualité  ';
  const waitingReason = pendingDialog.getByLabel('Motif de mise en attente *');
  await waitingReason.fill(waitingDraft);
  let failWaitingOnce = true;
  const pendingFailureRoute = async (route: import('@playwright/test').Route) => {
    const request = route.request();
    const payload = request.postDataJSON() as { waitingReason?: string } | null;
    if (
      failWaitingOnce &&
      request.method() === 'PATCH' &&
      typeof payload?.waitingReason === 'string'
    ) {
      failWaitingOnce = false;
      await route.abort('failed');
      return;
    }
    await route.continue();
  };
  await maintenancePage.route('**/api/workshop/incidents/*', pendingFailureRoute);
  await pendingDialog.getByRole('button', { name: 'Suspendre', exact: true }).click();
  await expect(pendingDialog.getByRole('alert')).toContainText(
    'Connexion impossible. Vérifiez votre réseau puis réessayez.'
  );
  await expect(waitingReason).toHaveValue(waitingDraft);
  await expect(waitingReason).toBeFocused();
  await expect(pendingDialog).toBeVisible();
  await maintenancePage.unroute('**/api/workshop/incidents/*', pendingFailureRoute);

  await pendingDialog.getByRole('button', { name: 'Suspendre', exact: true }).click();
  await expect(maintenancePage.getByRole('status')).toContainText('Incident mis en attente.');
  await expect(maintenancePage.getByRole('button', { name: 'Reprendre' })).toBeVisible();

  await maintenancePage.getByRole('button', { name: 'Reprendre' }).click();
  await maintenancePage.getByRole('button', { name: 'Confirmer' }).click();
  await expect(maintenancePage.getByRole('status')).toContainText('Traitement repris.');
  await expect(maintenancePage.getByRole('button', { name: 'Clôturer' })).toBeVisible();

  const closeTrigger = maintenancePage.getByRole('button', { name: 'Clôturer' });
  await closeTrigger.click();
  const firstCloseDialog = maintenancePage.getByRole('dialog', {
    name: "Clôturer l'incident",
  });
  await expect(firstCloseDialog).toContainText(/définitive/i);
  await expect(firstCloseDialog).toContainText(/conservé dans l’historique/i);
  await firstCloseDialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(firstCloseDialog).toBeHidden();
  await expect(closeTrigger).toBeFocused();

  await closeTrigger.click();
  const closeDialog = maintenancePage.getByRole('dialog', {
    name: "Clôturer l'incident",
  });
  await closeDialog
    .getByPlaceholder("Décrivez l'intervention réalisée")
    .fill('Pièce remplacée, incident résolu (E2E).');
  await closeDialog.getByRole('button', { name: 'Clôturer', exact: true }).click();
  await expect(maintenancePage.getByRole('status')).toContainText(
    'Incident clôturé et conservé dans l’historique.'
  );

  const closedPanel = maintenancePage.locator('aside.incident-detail-drawer');
  await expect(closedPanel.getByText('Clôturé')).toBeVisible();
  await expect(
    maintenancePage.getByRole('button', { name: 'Prendre en charge' })
  ).not.toBeVisible();
  await expect(maintenancePage.getByRole('button', { name: 'Clôturer' })).not.toBeVisible();

  await maintenanceContext.close();
});
