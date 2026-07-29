import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { E2E_MAINTENANCE_BADGE, E2E_OPERATOR_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

test.describe.configure({ retries: 0 });

const VIEWPORTS = [
  { name: '320x844', width: 320, height: 844 },
  { name: '390x844', width: 390, height: 844 },
  { name: '640x720', width: 640, height: 720 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1440x900', width: 1440, height: 900 },
] as const;

async function loginAsWorkshop(page: Page, badge: string): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(badge);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function chooseSelectField(
  page: Page,
  ariaLabel: string,
  optionText: string | RegExp
): Promise<void> {
  await page.getByRole('combobox', { name: ariaLabel }).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

/**
 * Crée un incident, le clôture avec une note d'intervention (opérateur puis
 * technicien), le rendant éligible à la Base de connaissance (CLOSED +
 * intervention_note non vide, cf. workshop.repository.ts isKnowledgeEligible).
 */
async function createKnowledgeIncident(
  page: Page,
  options: { head: number; product: string; comment: string; interventionNote: string }
): Promise<void> {
  await page.getByRole('button', { name: '+ Créer un incident' }).click();
  await chooseSelectField(page, 'Ligne', '999');
  await chooseSelectField(page, 'Machine', /E2E-MCH-1/);
  await chooseSelectField(page, 'Robot', '1');
  await chooseSelectField(page, 'Tête', String(options.head));
  await chooseSelectField(page, 'État', 'Dégradée');
  await page.getByPlaceholder('Référence produit').fill(options.product);
  await page.getByLabel('Commentaire').fill(options.comment);
  await page.getByRole('button', { name: 'Aperçu' }).click();
  await page.getByRole('button', { name: 'Valider la création' }).click();
  await expect(page.getByRole('status')).toContainText('Incident signalé.');

  const card = page.locator('article', { hasText: options.product });
  await card.getByRole('link', { name: /Ouvrir incident/i }).click();

  await page.getByRole('button', { name: 'Prendre en charge' }).click();
  await page.getByRole('button', { name: 'Confirmer' }).click();
  await expect(page.getByRole('status')).toContainText('Prise en charge enregistrée.');

  await page.getByRole('button', { name: 'Clôturer' }).click();
  const closeDialog = page.getByRole('dialog', { name: "Clôturer l'incident" });
  await closeDialog
    .getByPlaceholder("Décrivez l'intervention réalisée")
    .fill(options.interventionNote);
  await closeDialog.getByRole('button', { name: 'Clôturer', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Incident clôturé');

  await page.getByRole('button', { name: 'Fermer le détail' }).click();
}

async function goToKnowledge(page: Page): Promise<void> {
  await page.goto('/workshop/knowledge');
  await expect(page.getByRole('heading', { name: 'Base de connaissance' })).toBeVisible();
  await expect(page.locator('.kb-list-skeleton')).toHaveCount(0);
}

/** Scan exhaustif : tout élément dont le bord droit dépasse le viewport courant. */
async function findOverflowOffenders(
  page: Page
): Promise<{ selector: string; right: number; width: number }[]> {
  return page.evaluate(() => {
    const results: { selector: string; right: number; width: number }[] = [];
    const clientWidth = document.documentElement.clientWidth;
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > clientWidth + 1) {
        const cls = typeof el.className === 'string' ? el.className : '';
        results.push({
          selector: `${el.tagName.toLowerCase()}${cls ? '.' + cls.split(' ').join('.') : ''}`,
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    });
    return results;
  });
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const doc = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const offenders = await findOverflowOffenders(page);
  await test.info().attach(`document-${label}`, {
    body: JSON.stringify({ ...doc, offenders }, null, 2),
    contentType: 'application/json',
  });
  expect(
    doc.scrollWidth,
    `le document ne doit pas déborder horizontalement à ${label} (offenders: ${JSON.stringify(offenders)})`
  ).toBeLessThanOrEqual(doc.clientWidth + 1);
  expect(offenders, `aucun élément ne doit dépasser le viewport à ${label}`).toEqual([]);
}

test.describe('Base de connaissance — préparation des fiches (RC5-6)', () => {
  test('setup : deux fiches clôturées avec contenu long, disponibles pour la connaissance', async ({
    page,
  }) => {
    await loginAsWorkshop(page, E2E_MAINTENANCE_BADGE);
    // Tête 5 : utilisée aussi par incident-lifecycle.spec.ts, qui clôture
    // systématiquement son incident (cycle de vie complet) — la contrainte
    // d'unicité (OPEN/PENDING uniquement) libère donc la tête de façon fiable.
    await createKnowledgeIncident(page, {
      head: 5,
      product: `E2E-KB-A-${Date.now()}`,
      comment:
        'Symptôme observé avec un texte volontairement long pour vérifier le retour à la ligne sur mobile sans provoquer de débordement horizontal du document complet.',
      interventionNote:
        'Solution détaillée et longue décrivant précisément chaque étape de l’intervention réalisée sur la machine afin de vérifier que le fond de la carte solution ne dépasse jamais la largeur de son conteneur parent.',
    });
  });

  test('setup : fiche avec produit long, disponible pour la connaissance', async ({ page }) => {
    await loginAsWorkshop(page, E2E_MAINTENANCE_BADGE);
    // Tête 14 : le scénario d'annulation de workshop-mutation-feedback.spec.ts
    // s'y termine toujours en statut CANCELED (hors OPEN/PENDING), donc la tête
    // est libre. Têtes 13 et 15 sont évitées : certains chemins de ces specs
    // laissent l'incident OPEN, ce qui provoquerait une collision durable.
    await createKnowledgeIncident(page, {
      head: 14,
      // 120 caractères = limite réelle du champ produit (PRODUCT: 120, domain/constants.ts) —
      // reproduit fidèlement un cas de contenu long réaliste, pas fabriqué au-delà du contrat.
      product: `E2E-KB-LONGPRODUCT-${'X'.repeat(90)}-${Date.now()}`.slice(0, 120),
      comment:
        'Symptôme B avec un texte volontairement long pour vérifier le retour à la ligne sur mobile sans provoquer de débordement horizontal du document complet, sur plusieurs phrases.',
      interventionNote:
        'Solution B détaillée et longue décrivant précisément chaque étape de l’intervention réalisée sur la machine afin de vérifier que le fond de la carte solution ne dépasse jamais la largeur de son conteneur parent, même avec un paragraphe conséquent.',
    });
  });
});

test.describe('Base de connaissance — géométrie multi-viewports (RC5-6)', () => {
  for (const viewport of VIEWPORTS) {
    test(`aucun débordement horizontal à ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
      await goToKnowledge(page);

      const cardCount = await page.locator('.kb-card').count();
      test.skip(cardCount === 0, 'Aucune fiche connaissance disponible dans cet environnement E2E');
      const longCard = page.locator('.kb-card', { hasText: 'E2E-KB-LONGPRODUCT' });
      if (await longCard.count()) {
        await longCard.first().click();
      } else {
        await page.locator('.kb-card').first().click();
      }
      await expect(page.locator('.kb-detail')).toBeVisible();

      await assertNoHorizontalOverflow(page, viewport.name);

      const badgeBox = await page.locator('.kb-state-badge-lg').boundingBox();
      expect(badgeBox, 'le badge doit être visible').not.toBeNull();
      if (badgeBox) {
        const doc = await page.evaluate(() => document.documentElement.clientWidth);
        expect(badgeBox.x, 'bord gauche du badge dans le viewport').toBeGreaterThanOrEqual(0);
        expect(
          badgeBox.x + badgeBox.width,
          'bord droit du badge dans le viewport'
        ).toBeLessThanOrEqual(doc + 1);
      }

      const metaGridBox = await page.locator('.kb-meta-grid').boundingBox();
      expect(metaGridBox).not.toBeNull();
      const actionsBox = await page.locator('.kb-actions').boundingBox();
      expect(actionsBox).not.toBeNull();
      if (metaGridBox && actionsBox) {
        const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(
          metaGridBox.x + metaGridBox.width,
          'bord droit de la grille de métadonnées dans le viewport'
        ).toBeLessThanOrEqual(clientWidth + 1);
        expect(
          actionsBox.x + actionsBox.width,
          'les boutons d’action doivent rester dans le viewport'
        ).toBeLessThanOrEqual(clientWidth + 1);
      }
    });
  }
});

test.describe('Base de connaissance — comportements préservés (RC5-6)', () => {
  test('changer de fiche met à jour le détail sans recharger la page', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await goToKnowledge(page);

    const cards = page.locator('.kb-card');
    const count = await cards.count();
    test.skip(count < 2, 'Il faut au moins deux fiches pour vérifier le changement de sélection');

    const productValue = page.locator('.kb-meta-grid .kb-meta-item').nth(1).locator('strong');

    await cards.nth(0).click();
    await expect(cards.nth(0)).toHaveClass(/kb-card-active/);
    const firstProduct = await productValue.textContent();

    await cards.nth(1).click();
    await expect(cards.nth(1)).toHaveClass(/kb-card-active/);
    await expect(cards.nth(0)).not.toHaveClass(/kb-card-active/);
    await expect(productValue).not.toHaveText(firstProduct ?? '');

    await assertNoHorizontalOverflow(page, '390-apres-changement-fiche');
  });

  test('la sélection reste pilotable par le paramètre d’URL "incident"', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await goToKnowledge(page);

    const cardCount = await page.locator('.kb-card').count();
    test.skip(cardCount === 0, 'Aucune fiche connaissance disponible dans cet environnement E2E');

    await page.locator('.kb-card').first().click();
    await expect(page.locator('.kb-detail')).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get('incident')).not.toBeNull();

    await page.reload();
    await expect(page.locator('.kb-detail')).toBeVisible();
  });

  test('le bouton "Copier le lien" reste utilisable et dans le viewport', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await goToKnowledge(page);

    const cardCount = await page.locator('.kb-card').count();
    test.skip(cardCount === 0, 'Aucune fiche connaissance disponible dans cet environnement E2E');
    await page.locator('.kb-card').first().click();

    const copyButton = page.getByRole('button', { name: 'Copier le lien' });
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(page.getByRole('button', { name: 'Lien copié !' })).toBeVisible();
  });

  test('le bouton "Trace historique" navigue vers le journal de l’incident', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await goToKnowledge(page);

    const cardCount = await page.locator('.kb-card').count();
    test.skip(cardCount === 0, 'Aucune fiche connaissance disponible dans cet environnement E2E');
    await page.locator('.kb-card').first().click();

    await page.getByRole('button', { name: 'Trace historique' }).click();
    await page.waitForURL('**/workshop/history?incident=*');
  });

  test('les filtres restent utilisables et sans débordement sur mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await goToKnowledge(page);

    const searchInput = page.getByRole('textbox', { name: 'Recherche' });
    await searchInput.fill('E2E-KB');
    await expect(page.locator('.kb-card').first()).toBeVisible();
    await assertNoHorizontalOverflow(page, '390-apres-recherche');

    await searchInput.fill('');
  });

  test('le focus clavier reste visible en naviguant vers une fiche similaire', async ({ page }) => {
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await goToKnowledge(page);

    const relatedButtons = page.locator('.kb-related-item');
    const relatedCount = await relatedButtons.count();
    test.skip(relatedCount === 0, 'Aucune fiche similaire disponible dans cet environnement E2E');

    await relatedButtons.first().focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? { tag: el.tagName, cls: el.className } : null;
    });
    expect(focused?.cls).toContain('kb-related-item');
    const outline = await relatedButtons
      .first()
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });
});

test.describe('Base de connaissance — accessibilité (axe-core, RC5-6)', () => {
  test('aucune violation sérieuse ou critique avec une fiche sélectionnée, à 390px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await goToKnowledge(page);

    const cardCount = await page.locator('.kb-card').count();
    test.skip(cardCount === 0, 'Aucune fiche connaissance disponible dans cet environnement E2E');
    await page.locator('.kb-card').first().click();
    await expect(page.locator('.kb-detail')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('aucune violation sérieuse ou critique avec une fiche sélectionnée, à 1440px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await goToKnowledge(page);

    const cardCount = await page.locator('.kb-card').count();
    test.skip(cardCount === 0, 'Aucune fiche connaissance disponible dans cet environnement E2E');
    await page.locator('.kb-card').first().click();
    await expect(page.locator('.kb-detail')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
