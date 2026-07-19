import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAME,
  E2E_RESPONSABLE_BADGE,
  E2E_WORKSHOP_PASSWORD,
} from './fixtures';

const ADMIN_COOKIE = 'sentinel_admin_token';
const API_ORIGIN = 'http://127.0.0.1:3100';

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

async function fetchContract(
  page: Page,
  path: string
): Promise<{
  status: number;
  cacheControl: string | null;
}> {
  return page.evaluate(async (url) => {
    const response = await fetch(url, { credentials: 'include' });
    return {
      status: response.status,
      cacheControl: response.headers.get('cache-control'),
    };
  }, `${API_ORIGIN}${path}`);
}

async function tamperCookie(context: BrowserContext, name: string): Promise<void> {
  const cookie = (await context.cookies()).find((candidate) => candidate.name === name);
  expect(cookie).toBeDefined();
  const replacement = cookie!.value.endsWith('a') ? 'b' : 'a';
  await context.addCookies([
    {
      name: cookie!.name,
      value: `${cookie!.value.slice(0, -1)}${replacement}`,
      domain: cookie!.domain,
      path: cookie!.path,
      httpOnly: cookie!.httpOnly,
      secure: cookie!.secure,
      sameSite: cookie!.sameSite,
    },
  ]);
}

test('le cookie Admin absent ou altéré est refusé', async ({ page, context }) => {
  await page.goto('/admin/login');
  const missingCookieResponse = await fetchContract(page, '/api/admin/dashboard');
  expect(missingCookieResponse.status).toBe(401);
  expect(missingCookieResponse.cacheControl).toContain('no-store');

  await loginAsAdmin(page);
  await tamperCookie(context, ADMIN_COOKIE);

  const response = await fetchContract(page, '/api/admin/dashboard');

  expect(response.status).toBe(401);
  expect(response.cacheControl).toContain('no-store');
  expect((await context.cookies()).find((cookie) => cookie.name === ADMIN_COOKIE)).toBeUndefined();
});

test('les espaces Admin, Atelier et Board interdisent la mise en cache', async ({ page }) => {
  await loginAsAdmin(page);
  for (const path of ['/api/auth/me', '/api/admin/dashboard']) {
    const response = await fetchContract(page, path);
    expect(response.status).toBe(200);
    expect(response.cacheControl).toContain('no-store');
  }

  await page.evaluate(async (url) => {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`Logout failed with ${response.status}.`);
  }, `${API_ORIGIN}/api/auth/logout`);
  await loginAsResponsable(page);
  for (const path of ['/api/workshop/lines', '/api/board/data']) {
    const response = await fetchContract(page, path);
    expect(response.status).toBe(200);
    expect(response.cacheControl).toContain('no-store');
  }
});
