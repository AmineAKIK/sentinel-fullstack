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

  test('un échec réseau à la sortie conserve le Board et permet un vrai réessai', async ({
    page,
  }) => {
    await page.goto('/board');
    await page.getByLabel("Code d'accès").fill(E2E_BOARD_CODE);
    await page.getByRole('button', { name: 'Accéder au tableau' }).click();
    await expect(page.locator('main.board-page')).toBeVisible();

    let logoutRequests = 0;
    const failLogout = async (route: import('@playwright/test').Route) => {
      logoutRequests += 1;
      await route.abort('failed');
    };
    await page.route('**/api/board/logout', failLogout);

    const quit = page.getByRole('button', { name: 'Quitter' });
    await quit.click();
    await expect(page.getByRole('alert')).toContainText(
      'Impossible de quitter le Board. Réessayez.'
    );
    await expect(page.locator('main.board-page')).toBeVisible();
    await expect(quit).toBeEnabled();
    await expect(quit).toBeFocused();
    expect(logoutRequests).toBe(1);

    // L'erreur est persistante : l'utilisateur la ferme explicitement avant de
    // réactiver la commande située sous la carte en haut à droite.
    await page.getByRole('button', { name: 'Fermer la notification' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(quit).toBeFocused();
    await page.unroute('**/api/board/logout', failLogout);
    await quit.click();
    await page.waitForURL('**/login');
  });
});
