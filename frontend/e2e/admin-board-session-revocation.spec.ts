import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
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
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

async function expectVisibleKeyboardFocus(locator: Locator): Promise<void> {
  await expect(locator).toBeFocused();
  expect(
    await locator.evaluate((element) => {
      const style = window.getComputedStyle(element);
      const outlined =
        style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth || '0') > 0;
      return outlined || (style.boxShadow !== 'none' && style.boxShadow !== '');
    })
  ).toBe(true);
}

test('RC5-AUD-04 — l’erreur Admin est reliée au champ après Entrée et Échap restaure le focus exact', async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto('/admin/parametres');

  const boardSessions = page.getByLabel('Sessions board atelier', { exact: true });
  await boardSessions.check();
  const behaviorForm = boardSessions.locator('xpath=ancestor::form');
  const save = behaviorForm.getByRole('button', { name: 'Enregistrer' });
  await save.click();

  const dialog = page.getByRole('dialog', { name: 'Révoquer des sessions ?' });
  await expect(dialog).toBeVisible();
  const password = dialog.getByLabel('Mot de passe administrateur');
  await password.fill('mot-de-passe-incorrect');
  const confirm = dialog.getByRole('button', { name: 'Révoquer' });
  await confirm.focus();
  await page.keyboard.press('Enter');

  const passwordError = dialog.getByRole('alert');
  await expect(passwordError).toHaveText('Mot de passe incorrect.');
  await expect(passwordError).toHaveAttribute('id', 'admin-password-error');
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await expect(password).toHaveAttribute('aria-describedby', 'admin-password-error');
  await expect(password).toHaveAccessibleDescription('Mot de passe incorrect.');
  await expectVisibleKeyboardFocus(password);
  await expectNoSeriousViolations(page);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expectVisibleKeyboardFocus(save);
});

test('RC5-AUD-05 — Espace conserve le label et le focus visible du champ Board désactivé', async ({
  page,
}) => {
  await loginAsAdmin(page);
  await page.goto('/admin/parametres');

  const noExpiry = page.getByRole('checkbox', {
    name: 'Session Board sans expiration automatique',
  });
  await expect(noExpiry).not.toBeChecked();
  for (let index = 0; index < 100; index += 1) {
    if (await noExpiry.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(noExpiry).toBeFocused();
  await page.keyboard.press('Space');

  await expect(noExpiry).toBeChecked();
  await expect(noExpiry).toBeFocused();
  const toggleTrack = noExpiry.locator(
    'xpath=following-sibling::span[contains(@class,"toggle-track")]'
  );
  expect(
    await toggleTrack.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth || '0') > 0;
    })
  ).toBe(true);
  const ttlInput = page.getByRole('textbox', {
    name: 'Durée de session — Board atelier',
  });
  await expect(ttlInput).toHaveAttribute('id', 'boardSessionTtl');
  await expect(ttlInput).toBeDisabled();
  await expect(ttlInput).toHaveAccessibleName('Durée de session — Board atelier');
  await expectNoSeriousViolations(page);
});

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
