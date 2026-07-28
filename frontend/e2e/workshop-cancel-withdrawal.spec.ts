import { expect, test, type Page } from '@playwright/test';
import { E2E_OPERATOR_BADGE, E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

/**
 * Recette E2E multi-rôles du cycle « demande d'annulation puis retrait » (RC3
 * lot 5), vérifiée en navigateur réel sur l'incident seedé « E2E-RETRAIT »
 * (l'opérateur demandeur a une demande d'annulation active) :
 *  - le responsable voit l'indicateur « Annulation à arbitrer » (fait commun) ;
 *  - l'opérateur demandeur voit ce même indicateur ET l'action « Retirer ma
 *    demande » tant que la demande est active ;
 *  - après retrait, l'indicateur disparaît et l'action n'est plus proposée,
 *    y compris après rechargement côté responsable.
 *
 * Doit s'exécuter avant toute décision d'arbitrage sur ce même incident ; il est
 * le seul spec à toucher « E2E-RETRAIT ».
 */

const PRODUCT = 'E2E-RETRAIT';

async function loginAsWorkshop(page: Page, badge: string): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(badge);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

test('retrait d’une demande d’annulation : indicateur commun, action réservée au demandeur', async ({
  browser,
}) => {
  // Le responsable voit l'indicateur « Annulation à arbitrer » (fait commun).
  const responsableContext = await browser.newContext();
  const responsablePage = await responsableContext.newPage();
  await loginAsWorkshop(responsablePage, E2E_RESPONSABLE_BADGE);
  const responsableCard = responsablePage.locator('.incident-card').filter({ hasText: PRODUCT });
  await expect(responsableCard).toBeVisible();
  await expect(responsableCard.getByText('Annulation à arbitrer')).toBeVisible();

  // L'opérateur demandeur voit le même indicateur et peut retirer sa demande.
  const operatorContext = await browser.newContext();
  const operatorPage = await operatorContext.newPage();
  await loginAsWorkshop(operatorPage, E2E_OPERATOR_BADGE);
  const operatorCard = operatorPage.locator('.incident-card').filter({ hasText: PRODUCT });
  await expect(operatorCard).toBeVisible();
  await expect(operatorCard.getByText('Annulation à arbitrer')).toBeVisible();

  await operatorCard.getByRole('link', { name: /Ouvrir incident/i }).click();
  const dossier = operatorPage.locator('.incident-detail-drawer');
  const withdrawButton = dossier.getByRole('button', { name: 'Retirer ma demande' });
  await expect(withdrawButton).toBeVisible();

  // Retrait : l'action disparaît et l'indicateur s'efface.
  await withdrawButton.click();
  await expect(withdrawButton).toBeHidden();
  await expect(operatorCard.getByText('Annulation à arbitrer')).toHaveCount(0);

  // Côté responsable, après rechargement, l'indicateur a disparu également.
  await responsablePage.reload();
  const reloadedResponsableCard = responsablePage
    .locator('.incident-card')
    .filter({ hasText: PRODUCT });
  await expect(reloadedResponsableCard).toBeVisible();
  await expect(reloadedResponsableCard.getByText('Annulation à arbitrer')).toHaveCount(0);

  await operatorContext.close();
  await responsableContext.close();
});
