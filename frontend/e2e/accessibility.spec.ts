import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
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
  // Signal de disponibilité DÉTERMINISTE (pas un délai) : on attend que la page
  // ne soit plus en chargement — aucune région `aria-busy="true"` — avant de
  // scanner. Sinon axe pourrait analyser un état de squelette transitoire. Ce
  // n'est ni un retry, ni une exclusion, ni un masquage : on scanne l'état
  // fonctionnellement prêt, celui que voit réellement l'utilisateur.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical'
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test.describe('Accessibilité (axe-core, lot 8, A11Y-06) — espace public', () => {
  test('page de connexion Admin', async ({ page }) => {
    await page.goto('/admin/login');
    await expectNoSeriousViolations(page);
  });

  test('page de connexion Atelier', async ({ page }) => {
    await page.goto('/workshop/login');
    await expectNoSeriousViolations(page);
  });

  test('page d’accès Board', async ({ page }) => {
    await page.goto('/board');
    await expectNoSeriousViolations(page);
  });
});

test.describe('Accessibilité (axe-core, lot 8, A11Y-06) — espace Atelier (RESPONSABLE)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsResponsable(page);
  });

  test('dashboard atelier', async ({ page }) => {
    await page.goto('/workshop/dashboard');
    await expectNoSeriousViolations(page);
  });

  test('journal (A11Y-03 : filtre action)', async ({ page }) => {
    await page.goto('/workshop/journal');
    await expectNoSeriousViolations(page);
  });

  test('historique (A11Y-01 : carte incident)', async ({ page }) => {
    await page.goto('/workshop/history');
    await expectNoSeriousViolations(page);
  });

  test('connaissance', async ({ page }) => {
    await page.goto('/workshop/knowledge');
    await expectNoSeriousViolations(page);
  });

  test('pilotage (A11Y-05 : graphiques)', async ({ page }) => {
    await page.goto('/workshop/pilotage');
    await expectNoSeriousViolations(page);
  });
});

test.describe('Accessibilité (axe-core, lot 8, A11Y-06) — espace Admin', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('accueil admin', async ({ page }) => {
    await page.goto('/admin/accueil');
    await expectNoSeriousViolations(page);
  });

  test('liste des utilisateurs (A11Y-02 : tableau)', async ({ page }) => {
    await page.goto('/admin/users');
    await expectNoSeriousViolations(page);
  });

  test('liste des lignes (A11Y-02 : tableau)', async ({ page }) => {
    await page.goto('/admin/lines');
    await expectNoSeriousViolations(page);
  });

  test('fiche utilisateur (A11Y-04 : lien d’évitement)', async ({ page }) => {
    await page.goto('/admin/users');
    await page.locator('.row-action-button').first().click();
    await page.waitForURL('**/admin/users/*');
    await expectNoSeriousViolations(page);
  });
});
