import { expect, test } from '@playwright/test';
import { E2E_BOARD_CODE } from './fixtures';

test.describe('Accès Board', () => {
  test('un code invalide est refusé, un code valide donne accès au tableau', async ({ page }) => {
    await page.goto('/board');

    await expect(page.getByLabel("Code d'accès")).toBeVisible();

    await page.getByLabel("Code d'accès").fill('code-manifestement-faux');
    await page.getByRole('button', { name: 'Accéder au tableau' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await page.getByLabel("Code d'accès").fill(E2E_BOARD_CODE);
    await page.getByRole('button', { name: 'Accéder au tableau' }).click();

    await expect(page.locator('main.board-page')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réglages' })).toBeVisible();
  });

  test('le tableau reste accessible après rechargement (session persistée)', async ({ page }) => {
    await page.goto('/board');
    await page.getByLabel("Code d'accès").fill(E2E_BOARD_CODE);
    await page.getByRole('button', { name: 'Accéder au tableau' }).click();
    await expect(page.locator('main.board-page')).toBeVisible();

    await page.reload();

    await expect(page.locator('main.board-page')).toBeVisible();
    await expect(page.getByLabel("Code d'accès")).not.toBeVisible();
  });
});
