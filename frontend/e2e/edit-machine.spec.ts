import { test, expect, type Page } from '@playwright/test';
import {
  E2E_ADMIN_USERNAME,
  E2E_ADMIN_PASSWORD,
  E2E_LINE_NUMBER,
  E2E_MACHINE_ID,
} from './fixtures';

/**
 * Parcours bout-en-bout du flux d'édition d'une machine, axé sur la régression
 * corrigée : « Aperçu → Confirmer » sans changement ne doit RIEN enregistrer ni
 * afficher de message de succès. On vérifie aussi le cas inverse (un vrai
 * changement enregistre bien) pour prouver que le test discrimine.
 */

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto('/admin/login');
  await page.getByLabel('Identifiant').fill(E2E_ADMIN_USERNAME);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/admin/accueil');
}

async function openMachineModal(page: Page): Promise<void> {
  await page.goto('/admin/lines');
  // La ligne est cliquable ; le libellé accessible est unique par numéro.
  await page.getByRole('button', { name: `Voir la ligne ${E2E_LINE_NUMBER}` }).first().click();
  // Vue détail : titre « Ligne 999 ».
  await expect(page.getByRole('heading', { name: `Ligne ${E2E_LINE_NUMBER}` })).toBeVisible();
  // Clic sur la machine pour ouvrir la modale d'édition.
  await page.getByText(E2E_MACHINE_ID, { exact: true }).click();
  // Le titre de la modale est porté par l'aria-label du dialog (pas un heading).
  await expect(page.getByRole('dialog', { name: 'Modifier la machine' })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await loginAsAdmin(page);
});

test('aucun changement : Aperçu désactivé, aucune confirmation ne s\'affiche', async ({ page }) => {
  await openMachineModal(page);

  // Sans aucune modification, le bouton « Aperçu » est désactivé.
  await expect(page.getByRole('button', { name: 'Aperçu' })).toBeDisabled();

  // On ferme la modale et on s'assure qu'aucun message de succès n'est apparu.
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByText('Machine modifiée avec succès.')).toHaveCount(0);
});

test('modification réelle : aperçu avant/après puis confirmation', async ({ page }) => {
  await openMachineModal(page);

  // On change la marque → l'aperçu s'active. Le label est « Marque * ».
  const brand = page.getByLabel(/Marque/);
  await brand.fill('Fuji');
  const apercu = page.getByRole('button', { name: 'Aperçu' });
  await expect(apercu).toBeEnabled();
  await apercu.click();

  // Le récap (dialog « Aperçu machine ») montre l'ancienne et la nouvelle valeur.
  const preview = page.getByRole('dialog', { name: 'Aperçu machine' });
  await expect(preview.getByText('Panasonic')).toBeVisible();
  await expect(preview.getByText('Fuji')).toBeVisible();

  await page.getByRole('button', { name: 'Confirmer' }).click();

  // Cette fois, le message de succès apparaît bien.
  await expect(page.getByText('Machine modifiée avec succès.')).toBeVisible();

  // Note : ce test modifie la machine de façon persistante. L'idempotence de la
  // suite repose sur le re-seed (script `test:e2e`), pas sur un cleanup ici.
});
