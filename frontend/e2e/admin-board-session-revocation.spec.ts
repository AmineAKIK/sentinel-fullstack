import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME, E2E_BOARD_CODE } from './fixtures';

const API_ORIGIN = 'http://127.0.0.1:3100';

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Identifiant').fill(E2E_ADMIN_USERNAME);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/admin/accueil');
}

async function loginToBoard(page: Page): Promise<void> {
  await page.goto('/board');
  await page.getByLabel("Code d'accès").fill(E2E_BOARD_CODE);
  await page.getByRole('button', { name: 'Accéder au tableau' }).click();
  await expect(page.locator('main.board-page')).toBeVisible();
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test('la révocation Board est confirmée et refuse réellement une session HTTP déjà émise', async ({
  page,
  browser,
}) => {
  const boardContext = await browser.newContext();
  const boardPage = await boardContext.newPage();
  await loginToBoard(boardPage);

  const beforeRevocation = await boardPage.evaluate(async (url) => {
    const response = await fetch(url, { credentials: 'include' });
    return response.status;
  }, `${API_ORIGIN}/api/board/data`);
  expect(beforeRevocation).toBe(200);

  await loginAsAdmin(page);
  await page.goto('/admin/parametres');

  const boardSessions = page.getByLabel('Sessions board atelier', { exact: true });
  await boardSessions.check();
  const behaviorForm = boardSessions.locator('xpath=ancestor::form');
  const save = behaviorForm.getByRole('button', { name: 'Enregistrer' });

  await save.click();
  let dialog = page.getByRole('dialog', { name: 'Révoquer des sessions ?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Sessions board atelier');
  await expect(dialog.getByLabel('Mot de passe administrateur')).toBeFocused();
  await expectNoSeriousViolations(page);

  await dialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(dialog).toBeHidden();
  await expect(save).toBeFocused();

  await save.click();
  dialog = page.getByRole('dialog', { name: 'Révoquer des sessions ?' });
  const password = dialog.getByLabel('Mot de passe administrateur');
  await password.fill('mot-de-passe-incorrect');
  await dialog.getByRole('button', { name: 'Révoquer' }).click();
  await expect(dialog.getByText('Mot de passe incorrect.')).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(password).toHaveValue('mot-de-passe-incorrect');
  await expect(password).toBeFocused();

  let patchRequests = 0;
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith('/api/admin/settings/app')) {
      patchRequests += 1;
    }
  });
  await password.fill(E2E_ADMIN_PASSWORD);
  await dialog.getByRole('button', { name: 'Révoquer' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Sessions révoquées.');
  expect(patchRequests).toBe(1);

  const afterRevocation = await boardPage.evaluate(async (url) => {
    const response = await fetch(url, { credentials: 'include' });
    const body = (await response.json()) as { error?: { code?: string } };
    return { status: response.status, code: body.error?.code };
  }, `${API_ORIGIN}/api/board/data`);
  expect(afterRevocation).toEqual({ status: 401, code: 'UNAUTHORIZED' });

  await boardContext.close();
});
