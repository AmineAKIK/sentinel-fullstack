import { expect, test, type Page, type Route } from '@playwright/test';
import { E2E_OPERATOR_BADGE, E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

async function loginAsWorkshop(page: Page, badge: string): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(badge);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function chooseSelectField(
  page: Page,
  ariaLabel: string,
  optionText: string | RegExp
): Promise<void> {
  await page.getByRole('combobox', { name: ariaLabel }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

async function createIncident(page: Page, product: string, head: number) {
  await page.getByRole('button', { name: '+ Créer un incident' }).click();
  await chooseSelectField(page, 'Ligne', '999');
  await chooseSelectField(page, 'Machine', /E2E-MCH-1/);
  await chooseSelectField(page, 'Robot', '1');
  await chooseSelectField(page, 'Tête', String(head));
  await chooseSelectField(page, 'État', 'Dégradée');
  await page.getByPlaceholder('Référence produit').fill(product);
  await page.getByLabel('Commentaire').fill(`Signalement ${product}`);
  await page.getByRole('button', { name: 'Aperçu' }).click();
  await page.getByRole('button', { name: 'Valider la création' }).click();
  await expect(page.getByRole('status')).toContainText('Incident signalé.');
  const card = page.locator('article', { hasText: product });
  await expect(card).toBeVisible();
  return card;
}

test('correction : demande, retrait, refus en erreur sûre puis vrai réessai', async ({
  page,
  browser,
}) => {
  const product = `E2E-RC4-CORRECTION-${Date.now()}`;
  await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
  const operatorCard = await createIncident(page, product, 13);
  await operatorCard.getByRole('link', { name: /Ouvrir incident/i }).click();
  const operatorPanel = page.locator('aside.incident-detail-drawer');

  async function requestCorrection(comment: string): Promise<void> {
    await operatorPanel.getByRole('button', { name: 'Demander une correction' }).click();
    const editDialog = page.getByRole('dialog', { name: "Modifier l'incident" });
    await editDialog.getByLabel('Commentaire').fill(comment);
    await editDialog.getByRole('button', { name: 'Aperçu' }).click();
    await page.getByRole('button', { name: 'Valider la modification' }).click();
    await expect(page.getByRole('status')).toContainText('Demande de correction envoyée.');
  }

  await requestCorrection('Première correction E2E RC4.');
  const withdraw = operatorPanel.getByRole('button', { name: 'Retirer ma demande' });
  await withdraw.click();
  await expect(page.getByRole('status')).toContainText('Demande de correction retirée.');
  await expect(withdraw).toBeHidden();

  await requestCorrection('Correction E2E RC4 à refuser.');

  const responsableContext = await browser.newContext();
  const responsablePage = await responsableContext.newPage();
  await loginAsWorkshop(responsablePage, E2E_RESPONSABLE_BADGE);
  const responsableCard = responsablePage.locator('article', { hasText: product });
  await expect(responsableCard).toBeVisible();
  await responsableCard.getByRole('link', { name: /Ouvrir incident/i }).click();
  const reviewDialog = responsablePage.getByRole('dialog', {
    name: 'Arbitrage correction',
  });
  await expect(reviewDialog).toBeVisible();
  await reviewDialog.getByRole('button', { name: 'Refuser la demande' }).click();
  const rejectionReason = '  Mesures incohérentes — série β\nà contrôler sur place  ';
  const reasonField = reviewDialog.getByLabel('Motif du refus');
  await reasonField.fill(rejectionReason);

  const technicalSentinels = [
    'board_session_ttl_hours',
    'waiting_reason',
    'decision_reason',
    'internal_failure',
    'SELECT * FROM workshop_incidents',
    'HTTP 500 Internal Server Error',
    'internal_field_rc4',
    'internal_reason_rc4',
  ];
  let failRejectionOnce = true;
  const rejectionFailure = async (route: Route) => {
    const request = route.request();
    const payload = request.postDataJSON() as { rejectEditRequest?: boolean } | null;
    if (failRejectionOnce && request.method() === 'PATCH' && payload?.rejectEditRequest) {
      failRejectionOnce = false;
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: technicalSentinels.join(' | '),
            details: { field: 'decisionReason', reason: 'INVALID_FORMAT' },
          },
        }),
      });
      return;
    }
    await route.continue();
  };
  await responsablePage.route('**/api/workshop/incidents/*', rejectionFailure);
  await reviewDialog.getByRole('button', { name: 'Confirmer le refus' }).click();

  const visibleError = reviewDialog.getByRole('alert');
  await expect(visibleError).toContainText('Le motif du refus a un format invalide.');
  await expect(reasonField).toHaveValue(rejectionReason);
  await expect(reasonField).toBeFocused();
  await expect(reviewDialog).toBeVisible();
  for (const sentinel of technicalSentinels) {
    await expect(responsablePage.locator('body')).not.toContainText(sentinel);
  }

  await responsablePage.unroute('**/api/workshop/incidents/*', rejectionFailure);
  await reviewDialog.getByRole('button', { name: 'Confirmer le refus' }).click();
  await expect(reviewDialog).toBeHidden();
  await expect(responsablePage.getByRole('status')).toContainText(
    'Demande de modification refusée.'
  );
  await responsableContext.close();
});

test('annulation : demande, retrait, nouvelle demande puis confirmation définitive', async ({
  page,
  browser,
}) => {
  const product = `E2E-RC4-ANNULATION-${Date.now()}`;
  await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
  const operatorCard = await createIncident(page, product, 14);
  await operatorCard.getByRole('link', { name: /Ouvrir incident/i }).click();
  const operatorPanel = page.locator('aside.incident-detail-drawer');

  async function requestCancellation(reason: string): Promise<void> {
    await operatorPanel.getByRole('button', { name: "Demander l'annulation" }).click();
    const dialog = page.getByRole('dialog', { name: 'Demande d’annulation' });
    await dialog.getByLabel('Motif d’annulation *').fill(reason);
    await dialog.getByRole('button', { name: 'Envoyer la demande' }).click();
    await expect(page.getByRole('status')).toContainText('Demande d’annulation envoyée.');
  }

  await requestCancellation('Première demande E2E RC4.');
  const withdraw = operatorPanel.getByRole('button', { name: 'Retirer ma demande' });
  await withdraw.click();
  await expect(page.getByRole('status')).toContainText('Demande d’annulation retirée.');
  await expect(withdraw).toBeHidden();
  await requestCancellation('Doublon E2E RC4 à annuler définitivement.');

  const responsableContext = await browser.newContext();
  const responsablePage = await responsableContext.newPage();
  await loginAsWorkshop(responsablePage, E2E_RESPONSABLE_BADGE);
  const responsableCard = responsablePage.locator('article', { hasText: product });
  await expect(responsableCard).toBeVisible();
  await responsableCard.getByRole('link', { name: /Ouvrir incident/i }).click();
  const reviewDialog = responsablePage.getByRole('dialog', {
    name: 'Arbitrage annulation',
  });
  await expect(reviewDialog).toContainText(/annulation définitive/i);
  await reviewDialog.getByRole('button', { name: "Confirmer l'annulation" }).click();
  await expect(reviewDialog).toBeHidden();
  await expect(responsablePage.getByRole('status')).toContainText(
    'Incident annulé et conservé dans l’historique.'
  );
  await responsableContext.close();
});

test('suivi, urgence et consigne : une mutation réelle et un feedback précis', async ({ page }) => {
  const product = `E2E-RC4-TRANSVERSE-${Date.now()}`;
  await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
  const card = await createIncident(page, product, 15);
  await card.getByRole('link', { name: /Ouvrir incident/i }).click();
  const panel = page.locator('aside.incident-detail-drawer');

  const mutationRequests: string[] = [];
  page.on('request', (request) => {
    if (
      (request.method() === 'PATCH' && request.postData()?.includes('isPriority')) ||
      (request.method() === 'POST' && request.url().endsWith('/follow'))
    ) {
      mutationRequests.push(`${request.method()} ${request.url()}`);
    }
  });

  const urgent = panel.getByRole('button', { name: 'Déclarer urgent' });
  const urgentBox = await urgent.boundingBox();
  expect(urgentBox).not.toBeNull();
  await page.mouse.dblclick(
    urgentBox!.x + urgentBox!.width / 2,
    urgentBox!.y + urgentBox!.height / 2
  );
  await expect(page.getByRole('status')).toContainText('Incident déclaré urgent.');
  expect(mutationRequests.filter((request) => request.startsWith('PATCH'))).toHaveLength(1);
  await expect(panel.getByRole('button', { name: "Retirer l'urgence" })).toBeVisible();

  const follow = panel.getByRole('button', { name: 'Suivre cet incident' });
  const followBox = await follow.boundingBox();
  expect(followBox).not.toBeNull();
  await page.mouse.dblclick(
    followBox!.x + followBox!.width / 2,
    followBox!.y + followBox!.height / 2
  );
  await expect(page.getByRole('status')).toContainText('Suivi activé.');
  expect(mutationRequests.filter((request) => request.startsWith('POST'))).toHaveLength(1);
  await expect(panel.getByRole('button', { name: 'Retirer du suivi' })).toBeVisible();

  const instruction = panel.getByLabel('Consigne responsable');
  await instruction.fill('  Prioriser après contrôle qualité β.  ');
  await panel.getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.getByRole('status')).toContainText('Consigne enregistrée.');
  await expect(
    panel.locator('.incident-instruction-card').getByText('Prioriser après contrôle qualité β.')
  ).toBeVisible();

  await panel.getByRole('button', { name: 'Retirer la consigne' }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Retirer la consigne' });
  await deleteDialog.getByRole('button', { name: 'Retirer' }).click();
  await expect(page.getByRole('status')).toContainText('Consigne retirée.');
  await expect(deleteDialog).toBeHidden();
});
