import AxeBuilder from '@axe-core/playwright';
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

async function expectNoSeriousViolations(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

const surfaces = [
  {
    name: 'Administration',
    login: loginAsAdmin,
    path: '/admin/support',
    endpoint: '**/api/admin/support/chat',
  },
  {
    name: 'Atelier',
    login: loginAsResponsable,
    path: '/workshop/support',
    endpoint: '**/api/workshop/support/chat',
  },
] as const;

for (const surface of surfaces) {
  test(`${surface.name} Support : l’échec métier conserve la saisie, puis le réessai réussit`, async ({
    page,
  }) => {
    await surface.login(page);
    await page.goto(surface.path);

    const draft = `  Question ${surface.name} conservée\navec détails β.  `;
    const textarea = page.getByRole('textbox', { name: 'Message' });
    await textarea.fill(draft);

    const technicalMessage =
      'internal_failure | waiting_reason | SELECT * FROM private_support_messages';
    let failureRequests = 0;
    const businessFailure = async (route: Route) => {
      failureRequests += 1;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'SERVICE_UNAVAILABLE', message: technicalMessage },
        }),
      });
    };
    await page.route(surface.endpoint, businessFailure);

    await textarea.press('Enter');
    await expect(page.getByRole('alert')).toHaveText(
      'Le service est momentanément indisponible. Réessayez plus tard.'
    );
    await expect(page.locator('body')).not.toContainText(technicalMessage);
    await expect(textarea).toHaveValue(draft);
    await expect(textarea).toBeEnabled();
    await expect(textarea).toBeFocused();
    expect(failureRequests).toBe(1);

    await page.unroute(surface.endpoint, businessFailure);
    let successRequests = 0;
    const success = async (route: Route) => {
      successRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: `Réponse sûre pour ${surface.name}.` }),
      });
    };
    await page.route(surface.endpoint, success);

    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByRole('status')).toContainText('Message envoyé.');
    await expect(page.getByText(`Réponse sûre pour ${surface.name}.`)).toBeVisible();
    await expect(textarea).toHaveValue('');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(successRequests).toBe(1);
    await expectNoSeriousViolations(page);
  });
}
