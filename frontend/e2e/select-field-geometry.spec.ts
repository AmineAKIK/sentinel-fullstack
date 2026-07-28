import { expect, test, type Locator, type Page } from '@playwright/test';
import { E2E_OPERATOR_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

async function loginAsOperator(page: Page): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(E2E_OPERATOR_BADGE);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function expectInsideViewport(page: Page, listbox: Locator): Promise<void> {
  await expect(listbox).toBeVisible();
  const viewport = page.viewportSize();
  const box = await listbox.boundingBox();
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test('SelectField reste borné au viewport en haut, en bas, à 200 % et après resize', async ({
  page,
}) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await loginAsOperator(page);
  await page.getByRole('button', { name: '+ Créer un incident' }).click();
  const dialog = page.getByRole('dialog', { name: 'Créer un incident' });

  const line = dialog.getByRole('combobox', { name: 'Ligne' });
  await line.focus();
  await page.keyboard.press('Enter');
  await expectInsideViewport(page, page.getByRole('listbox'));
  await page.keyboard.press('Escape');
  await expect(line).toBeFocused();

  const state = dialog.getByRole('combobox', { name: 'État' });
  await state.scrollIntoViewIfNeeded();
  await state.click();
  const lowerListbox = page.getByRole('listbox');
  await expectInsideViewport(page, lowerListbox);

  await page.setViewportSize({ width: 390, height: 500 });
  await expectInsideViewport(page, lowerListbox);

  await state.press('ArrowDown');
  await state.press('Enter');
  await expect(lowerListbox).toBeHidden();
  await expect(state).not.toHaveText('Sélectionner un état');
});
