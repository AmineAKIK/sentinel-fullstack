import { expect, test, type Page, type Route } from '@playwright/test';
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAME,
  E2E_RESPONSABLE_BADGE,
  E2E_WORKSHOP_PASSWORD,
} from './fixtures';

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Identifiant').fill(E2E_ADMIN_USERNAME);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/admin/accueil');
}

async function loginAsResponsable(page: Page): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(E2E_RESPONSABLE_BADGE);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function proveRecoverableLogout(page: Page, login: (page: Page) => Promise<void>) {
  await login(page);
  const authenticatedPath = new URL(page.url()).pathname;

  let logoutRequests = 0;
  const failLogoutOnce = async (route: Route) => {
    logoutRequests += 1;
    await route.abort('failed');
  };
  await page.route('**/api/auth/logout', failLogoutOnce);

  const logout = page.getByRole('button', { name: 'Déconnexion' });
  await logout.click();

  await expect(page.getByRole('alert')).toContainText(
    'Connexion impossible. Vérifiez votre réseau puis réessayez.'
  );
  const errorNotification = page.locator('[data-feedback="error"]');
  await expect(errorNotification.getByText('Action impossible', { exact: true })).toBeVisible();
  await expect(
    errorNotification.getByRole('button', { name: 'Fermer la notification' })
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${authenticatedPath}$`));
  await expect(logout).toBeVisible();
  await expect(logout).toBeEnabled();
  await expect(logout).toBeFocused();
  expect(logoutRequests).toBe(1);

  await page.unroute('**/api/auth/logout', failLogoutOnce);
  await logout.click();
  await page.waitForURL('**/login');
}

test('Administration : un échec de déconnexion reste sur place puis le réessai aboutit', async ({
  page,
}) => {
  await proveRecoverableLogout(page, loginAsAdmin);
});

test('Atelier : un échec de déconnexion reste sur place puis le réessai aboutit', async ({
  page,
}) => {
  await proveRecoverableLogout(page, loginAsResponsable);
});
