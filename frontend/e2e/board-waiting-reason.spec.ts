import { expect, test, type Page } from '@playwright/test';
import {
  E2E_BOARD_CODE,
  E2E_LINE_NUMBER,
  E2E_MACHINE_ID,
  E2E_MAINTENANCE_BADGE,
  E2E_OPERATOR_BADGE,
  E2E_RESPONSABLE_BADGE,
  E2E_WORKSHOP_PASSWORD,
} from './fixtures';

const productRef = 'E2E-RC4-WAITING-REASON';
const waitingReason = 'RC4 — attente pièce détachée — conservation historique';
const privateComment = 'RC4-PRIVATE-COMMENT-DO-NOT-SHOW';

async function loginAsWorkshop(page: Page, badge: string): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(badge);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function chooseSelectField(page: Page, ariaLabel: string, optionText: string | RegExp) {
  await page.getByRole('combobox', { name: ariaLabel }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

async function openWorkshopCard(page: Page) {
  const card = page.locator('article.incident-card', { hasText: productRef });
  await expect(card).toHaveCount(1);
  await card.getByRole('link', { name: /Ouvrir incident/i }).click();
  const panel = page.locator('aside.incident-detail-drawer');
  await expect(panel.getByText(productRef)).toBeVisible();
  return { card, panel };
}

test('le Board suit le motif courant et l’Historique le conserve après reprise', async ({
  page,
  browser,
}) => {
  // Le contrat Board autorise un polling visible toutes les 30 s. Le budget du
  // parcours complet doit donc dépasser le timeout Playwright global de 30 s,
  // sans retry ni attente fixe : chaque étape attend un signal fonctionnel.
  test.setTimeout(90_000);

  // Donnée déterministe créée par le vrai parcours opérateur, sur une tête
  // distincte des fixtures E2E existantes.
  await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
  await page.getByRole('button', { name: '+ Créer un incident' }).click();
  await chooseSelectField(page, 'Ligne', E2E_LINE_NUMBER);
  await chooseSelectField(page, 'Machine', new RegExp(E2E_MACHINE_ID));
  await chooseSelectField(page, 'Robot', '1');
  await chooseSelectField(page, 'Tête', '13');
  await chooseSelectField(page, 'État', 'Dégradée');
  await page.getByPlaceholder('Ajouter un commentaire').fill(privateComment);
  await page.getByPlaceholder('Référence produit').fill(productRef);
  await page.getByRole('button', { name: 'Aperçu' }).click();
  await page.getByRole('button', { name: 'Valider la création' }).click();

  const operatorCard = page.locator('article.incident-card', { hasText: productRef });
  await operatorCard.getByRole('link', { name: /Ouvrir incident/i }).click();
  await page.waitForURL(/\/workshop\/dashboard\?incident=\d+$/);
  const incidentId = new URL(page.url()).searchParams.get('incident');
  expect(incidentId).toMatch(/^\d+$/);

  // Le responsable rend cette seule donnée urgente afin que la carte reste
  // déterministe dans la vue Board avant et après la reprise.
  const responsibleContext = await browser.newContext();
  const responsiblePage = await responsibleContext.newPage();
  await loginAsWorkshop(responsiblePage, E2E_RESPONSABLE_BADGE);
  const { panel: responsiblePanel } = await openWorkshopCard(responsiblePage);
  await responsiblePanel.getByRole('button', { name: 'Déclarer urgent' }).click();
  await expect(responsiblePanel.getByRole('button', { name: "Retirer l'urgence" })).toBeVisible();

  // Vrai parcours technicien : sélection précise ligne/machine, prise en charge
  // puis mise en attente avec la valeur exacte.
  const maintenanceContext = await browser.newContext();
  const maintenancePage = await maintenanceContext.newPage();
  await loginAsWorkshop(maintenancePage, E2E_MAINTENANCE_BADGE);
  let { card: maintenanceCard, panel: maintenancePanel } = await openWorkshopCard(maintenancePage);
  await maintenancePanel.getByRole('button', { name: 'Prendre en charge' }).click();
  await maintenancePage.getByRole('button', { name: 'Confirmer' }).click();
  await expect(maintenancePanel.getByRole('button', { name: 'Suspendre' })).toBeVisible();
  await maintenancePanel.getByRole('button', { name: 'Suspendre' }).click();
  await maintenancePage.getByLabel('Motif de mise en attente *').fill(waitingReason);
  await maintenancePage.getByRole('button', { name: 'Suspendre', exact: true }).last().click();

  await expect(maintenancePanel).toContainText('En attente');
  await expect(maintenancePanel).toContainText(waitingReason);
  await maintenancePage.getByRole('button', { name: 'Fermer le détail' }).click();
  await expect(maintenanceCard).toContainText('En attente');
  await expect(maintenanceCard).toContainText(`Motif de mise en attente : ${waitingReason}`);
  ({ card: maintenanceCard, panel: maintenancePanel } = await openWorkshopCard(maintenancePage));
  await expect(maintenancePanel).toContainText(waitingReason);

  // Session Board authentifiée par le vrai code. Le profil est réglé via son
  // UI pour ne conserver que les alertes urgentes, sans mock ni injection.
  const boardContext = await browser.newContext();
  const boardPage = await boardContext.newPage();
  await boardPage.goto('/board');
  await boardPage.getByLabel("Code d'accès").fill(E2E_BOARD_CODE);
  await boardPage.getByRole('button', { name: 'Accéder au tableau' }).click();
  await expect(boardPage.locator('main.board-page')).toBeVisible();
  await boardPage.getByRole('button', { name: 'Réglages' }).click();
  const settingsDialog = boardPage.getByRole('dialog', {
    name: "Paramètres d'affichage",
  });
  await settingsDialog.getByLabel('Tous les incidents ouverts').uncheck();
  await settingsDialog.getByLabel('Situation par ligne').uncheck();
  await settingsDialog.getByLabel('Urgences uniquement').check();
  await settingsDialog.getByRole('button', { name: 'Enregistrer' }).click();

  const boardCard = boardPage.locator('article.board-incident-card', { hasText: productRef });
  await expect(boardCard).toHaveCount(1);
  await expect(boardCard).toHaveAttribute(
    'aria-label',
    new RegExp(`ligne ${E2E_LINE_NUMBER}, machine ${E2E_MACHINE_ID}`)
  );
  await expect(boardCard).toContainText(`Ligne ${E2E_LINE_NUMBER}`);
  await expect(boardCard).toContainText(E2E_MACHINE_ID);
  await expect(boardCard).toContainText('En attente');
  await expect(boardCard).toContainText(`Motif de mise en attente : ${waitingReason}`);
  await expect(boardCard).not.toContainText(privateComment);
  await expect(boardCard).not.toContainText('Opérateur E2E');
  await expect(boardCard).not.toContainText('Responsable E2E');
  await expect(boardCard).not.toContainText('Maintenance E2E');
  await expect(boardCard).not.toContainText(E2E_OPERATOR_BADGE);
  await expect(boardCard).not.toContainText(E2E_RESPONSABLE_BADGE);
  await expect(boardCard).not.toContainText(E2E_MAINTENANCE_BADGE);
  await expect(boardCard).not.toContainText('OPERATOR');
  await expect(boardCard).not.toContainText('RESPONSABLE');
  await expect(boardCard).not.toContainText('MAINTENANCE');
  await expect(boardCard).not.toContainText('Diagnostic');
  await expect(
    boardCard.locator('button, a, input, textarea, select, [role="button"]')
  ).toHaveCount(0);

  // La reprise efface l'état courant côté Atelier.
  await maintenancePage.bringToFront();
  await maintenancePanel.getByRole('button', { name: 'Reprendre' }).click();
  await maintenancePage.getByRole('button', { name: 'Confirmer' }).click();
  await expect(maintenancePanel).toContainText('Pris en charge');
  await expect(maintenancePanel).not.toContainText(waitingReason);
  await maintenancePage.getByRole('button', { name: 'Fermer le détail' }).click();
  await expect(maintenanceCard).not.toContainText(waitingReason);
  await expect(maintenanceCard).not.toContainText('Motif de mise en attente');

  // Le contrat réel du Board combine focus/visibilité et polling visible de
  // 30 s. Les pages étant dans des contextes navigateur distincts, ce test ne
  // prétend pas qu'un événement focus est émis : il remet le Board au premier
  // plan puis attend le prochain GET réellement déclenché par l'un de ces
  // mécanismes, sans reload, délai fixe ni retry.
  const nextBoardDataRefresh = boardPage.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/board/data' &&
      response.status() === 200,
    { timeout: 40_000 }
  );
  await boardPage.bringToFront();
  await nextBoardDataRefresh;
  await expect(boardCard).toHaveCount(1);
  await expect(boardCard).toContainText('Pris en charge');
  await expect(boardCard).not.toContainText(waitingReason);
  await expect(boardCard).not.toContainText('Motif de mise en attente');

  // Le motif n'est plus courant, mais reste attaché aux événements historiques
  // de suspension/reprise et n'est jamais présenté comme un diagnostic.
  await maintenancePage.bringToFront();
  await maintenancePage.goto(`/workshop/history?incident=${incidentId}`);
  const pendingEvent = maintenancePage.locator('.timeline-item', { hasText: 'Suspendu' });
  const resumedEvent = maintenancePage.locator('.timeline-item', {
    hasText: 'Reprise en cours',
  });
  await expect(pendingEvent).toHaveCount(1);
  await expect(pendingEvent).toContainText(`motif de mise en attente: ${waitingReason}`);
  await expect(pendingEvent).not.toContainText('Diagnostic');
  await expect(resumedEvent).toHaveCount(1);
  await expect(resumedEvent).toContainText(`motif levé: ${waitingReason}`);
  await expect(resumedEvent).not.toContainText('Diagnostic');

  // Nettoyage fonctionnel par le vrai workflow : l'incident dédié est clôturé.
  await maintenancePage.goto(`/workshop/dashboard?incident=${incidentId}`);
  maintenancePanel = maintenancePage.locator('aside.incident-detail-drawer');
  await expect(maintenancePanel.getByText(productRef)).toBeVisible();
  await maintenancePanel.getByRole('button', { name: 'Clôturer' }).click();
  await maintenancePage
    .getByPlaceholder("Décrivez l'intervention réalisée")
    .fill('Contrôle RC4 terminé, incident E2E clôturé.');
  await maintenancePage.getByRole('button', { name: 'Clôturer', exact: true }).last().click();
  await expect(maintenancePanel).toContainText('Clôturé');

  await boardContext.close();
  await maintenanceContext.close();
  await responsibleContext.close();
});
