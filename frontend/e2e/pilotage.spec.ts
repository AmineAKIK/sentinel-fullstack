import { expect, test, type Page } from '@playwright/test';
import { E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

async function loginAsResponsable(page: Page): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(E2E_RESPONSABLE_BADGE);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function chooseSelectField(page: Page, ariaLabel: string, optionText: string) {
  const combobox = page.getByRole('combobox', { name: ariaLabel });
  await combobox.click();
  // Signal DÉTERMINISTE d'ouverture : le combobox porte aria-expanded="true"
  // quand le menu est réellement déployé. Sans cette attente, le clic sur
  // l'option course avec l'ouverture du menu (flakiness observée en CI).
  await expect(combobox).toHaveAttribute('aria-expanded', 'true');
  const option = page.getByRole('option', { name: optionText, exact: true });
  await expect(option).toBeVisible();
  await option.click();
  // Après sélection, le menu se referme : on confirme la fermeture pour que
  // l'interaction suivante reparte d'un état stable.
  await expect(combobox).toHaveAttribute('aria-expanded', 'false');
}

test.describe('Pilotage atelier', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsResponsable(page);
    await page.goto('/workshop/pilotage');
  });

  test('change de période préréglée et recharge les indicateurs sans erreur', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Pilotage atelier' })).toBeVisible();

    await chooseSelectField(page, 'Période', '30 derniers jours');
    await expect(page.getByRole('alert')).toHaveCount(0);

    await chooseSelectField(page, 'Période', "Aujourd'hui");
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('la période personnalisée active les deux champs de date et refuse une fin avant le début', async ({
    page,
  }) => {
    await chooseSelectField(page, 'Période', 'Personnalisée');

    const start = page.locator('#pilotage-date-start');
    const end = page.locator('#pilotage-date-end');
    await expect(start).toBeEnabled();
    await expect(end).toBeEnabled();

    await start.fill('2026-03-10');
    await end.fill('2026-03-01');

    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('le filtre Ligne restreint les options Machine disponibles', async ({ page }) => {
    const machineCombobox = page.getByRole('combobox', { name: 'Machine' });
    await expect(machineCombobox).toBeDisabled();

    await chooseSelectField(page, 'Ligne', '999');
    await expect(machineCombobox).toBeEnabled();
  });
});
