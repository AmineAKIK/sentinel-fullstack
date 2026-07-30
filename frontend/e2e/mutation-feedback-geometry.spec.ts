import { expect, test, type Page } from '@playwright/test';
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAME,
  E2E_RESPONSABLE_BADGE,
  E2E_WORKSHOP_PASSWORD,
} from './fixtures';

type NotificationMetrics = {
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  navBottom: number;
  rightGap: number;
  bottomGap: number;
  position: string;
  borderRadius: number;
  boxShadow: string;
  overflowsHorizontally: boolean;
};

async function loginAsWorkshop(page: Page): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(E2E_RESPONSABLE_BADGE);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Identifiant').fill(E2E_ADMIN_USERNAME);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/admin/accueil');
}

async function chooseSelectField(
  page: Page,
  ariaLabel: string,
  optionText: string | RegExp
): Promise<void> {
  await page.getByRole('combobox', { name: ariaLabel }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

async function expectNotificationCard(
  page: Page,
  message: string,
  evidenceLabel: string
): Promise<NotificationMetrics> {
  const card = page.locator('[data-feedback]').filter({ hasText: message });
  await expect(card, `${evidenceLabel}: notification visible`).toBeVisible();

  const metrics = await card.evaluate((element): NotificationMetrics => {
    const rect = element.getBoundingClientRect();
    const navRect = document.querySelector('.nav-bar')?.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const regionStyle = window.getComputedStyle(
      element.closest('.mutation-feedback-region') ?? element
    );
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      navBottom: navRect?.bottom ?? 0,
      rightGap: window.innerWidth - rect.right,
      bottomGap: window.innerHeight - rect.bottom,
      position: regionStyle.position,
      borderRadius: Number.parseFloat(style.borderRadius),
      boxShadow: style.boxShadow,
      overflowsHorizontally: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  const expectedMobileWidth = metrics.viewportWidth - 24;
  await test.info().attach(`géométrie-${evidenceLabel}`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json',
  });
  expect.soft(metrics.position, `${evidenceLabel}: position fixe`).toBe('fixed');
  expect
    .soft(metrics.width, `${evidenceLabel}: largeur minimale lisible`)
    .toBeGreaterThanOrEqual(Math.min(320, expectedMobileWidth) - 1);
  expect.soft(metrics.width, `${evidenceLabel}: largeur bornée`).toBeLessThanOrEqual(420);
  if (metrics.viewportWidth <= 420) {
    expect
      .soft(metrics.width, `${evidenceLabel}: largeur mobile viewport - 24 px`)
      .toBeCloseTo(expectedMobileWidth, 0);
  }
  expect.soft(metrics.rightGap, `${evidenceLabel}: marge droite`).toBeGreaterThanOrEqual(11);
  expect.soft(metrics.rightGap, `${evidenceLabel}: marge droite`).toBeLessThanOrEqual(20);
  expect
    .soft(metrics.y, `${evidenceLabel}: sous l’en-tête`)
    .toBeGreaterThan(metrics.navBottom + 10);
  expect
    .soft(metrics.y + metrics.height, `${evidenceLabel}: entièrement dans le viewport`)
    .toBeLessThanOrEqual(metrics.viewportHeight - 11);
  expect.soft(metrics.bottomGap, `${evidenceLabel}: non collée au bas`).toBeGreaterThanOrEqual(40);
  expect.soft(metrics.overflowsHorizontally, `${evidenceLabel}: aucun débordement`).toBe(false);
  expect.soft(metrics.borderRadius, `${evidenceLabel}: carte arrondie`).toBeGreaterThanOrEqual(6);
  expect.soft(metrics.boxShadow, `${evidenceLabel}: ombre de carte`).not.toBe('none');
  await expect.soft(card.getByText('Action réussie', { exact: true })).toBeVisible();
  await expect
    .soft(card.getByRole('button', { name: 'Fermer la notification' }))
    .toHaveCSS('min-width', '44px');

  return metrics;
}

test('création desktop puis annulation au viewport zoom 200 % utilisent une vraie carte globale', async ({
  page,
}) => {
  const product = `E2E-RC5-FEEDBACK-${Date.now()}`;
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAsWorkshop(page);

  await page.getByRole('button', { name: '+ Créer un incident' }).click();
  await chooseSelectField(page, 'Ligne', '999');
  await chooseSelectField(page, 'Machine', /E2E-MCH-1/);
  await chooseSelectField(page, 'Robot', '1');
  await chooseSelectField(page, 'Tête', '16');
  await chooseSelectField(page, 'État', 'Dégradée');
  await page.getByPlaceholder('Référence produit').fill(product);
  await page.getByLabel('Commentaire').fill(`Signalement ${product}`);
  await page.getByRole('button', { name: 'Aperçu' }).click();
  await page.getByRole('button', { name: 'Valider la création' }).click();

  await expectNotificationCard(page, 'Incident signalé.', 'création 1440×900');
  const card = page.locator('article', { hasText: product });
  await expect(card).toBeVisible();

  await page.setViewportSize({ width: 640, height: 720 });
  await card.getByRole('link', { name: /Ouvrir incident/i }).click();
  const panel = page.locator('aside.incident-detail-drawer');
  await panel.getByRole('button', { name: "Annuler l'incident" }).click();
  const dialog = page.getByRole('dialog', { name: "Annuler l'incident" });
  await dialog.getByRole('button', { name: 'Confirmer l’annulation' }).click();

  await expectNotificationCard(
    page,
    'Incident annulé et conservé dans l’historique.',
    'annulation 640×720'
  );
  await expect(card).toHaveCount(0);

  const dismiss = page.getByRole('button', { name: 'Fermer la notification' });
  await dismiss.focus();
  await expect(dismiss).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.locator('[data-feedback]').filter({
      hasText: 'Incident annulé et conservé dans l’historique.',
    })
  ).toHaveCount(0);
});

test('une mutation Administration depuis une modale reste visible et utilisable sur mobile', async ({
  page,
}) => {
  const badge = `8${Date.now()}`.slice(0, 12);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  await page.getByRole('button', { name: '+ Ajouter un utilisateur' }).click();
  await page.locator('#lastName').fill('Feedback');
  await page.locator('#firstName').fill('Mobile');
  await page.getByLabel('Numéro de badge').fill(badge);
  await chooseSelectField(page, 'Rôle', 'Opérateur');
  await page.getByRole('button', { name: 'Aperçu' }).click();
  await page.getByRole('button', { name: 'Confirmer la création' }).click();

  await expectNotificationCard(page, 'Utilisateur créé.', 'administration mobile 390×844');
  await expect(page.getByRole('dialog', { name: 'Code temporaire' })).toBeVisible();

  const dismiss = page.getByRole('button', { name: 'Fermer la notification' });
  await dismiss.focus();
  await expect(dismiss).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.locator('[data-feedback]').filter({ hasText: 'Utilisateur créé.' })
  ).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Code temporaire' })).toBeVisible();
});
