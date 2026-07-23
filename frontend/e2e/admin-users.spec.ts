import { expect, test, type Page } from '@playwright/test';
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAME } from './fixtures';

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Identifiant').fill(E2E_ADMIN_USERNAME);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/admin/accueil');
}

async function chooseSelectField(page: Page, ariaLabel: string, optionText: string) {
  await page.getByRole('combobox', { name: ariaLabel }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

test('création d’un utilisateur : aperçu, confirmation, code temporaire, puis présence dans la liste', async ({
  page,
}) => {
  const badge = `7${Date.now()}`.slice(0, 12);

  await loginAsAdmin(page);
  await page.goto('/admin/users');

  await page.getByRole('button', { name: '+ Ajouter un utilisateur' }).click();
  await page.locator('#lastName').fill('Dupont');
  await page.locator('#firstName').fill('Jean');
  await page.getByLabel('Numéro de badge').fill(badge);
  await chooseSelectField(page, 'Rôle', 'Opérateur');

  await page.getByRole('button', { name: 'Aperçu' }).click();
  await expect(page.getByText('Aperçu utilisateur')).toBeVisible();
  await expect(page.getByText(badge)).toBeVisible();

  await page.getByRole('button', { name: 'Confirmer la création' }).click();

  await expect(page.locator('.modal-title')).toHaveText('Code temporaire');
  // Alphabet du code : chiffres 2-9 et lettres majuscules sans ambiguïté visuelle.
  await expect(
    page.locator('.detail-field-value').filter({ hasText: /^[23456789A-HJ-NP-Z]{10}$/ })
  ).toBeVisible();

  await page.locator('button.btn-primary', { hasText: 'Fermer' }).click();

  await expect(page.getByText(badge).first()).toBeVisible();
  await expect(page.getByText('Dupont').first()).toBeVisible();
});

test('le badge d’un utilisateur existant est refusé à la création', async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto('/admin/users');

  await page.getByRole('button', { name: '+ Ajouter un utilisateur' }).click();
  await page.locator('#lastName').fill('Doublon');
  await page.locator('#firstName').fill('Test');
  await page.getByLabel('Numéro de badge').fill('990001');
  await chooseSelectField(page, 'Rôle', 'Responsable');
  // La disponibilité du badge est vérifiée dès le clic sur Aperçu, avant même
  // d'atteindre l'étape de confirmation.
  await page.getByRole('button', { name: 'Aperçu' }).click();

  await expect(page.getByText('Ce numéro de badge existe déjà.')).toBeVisible();
});
