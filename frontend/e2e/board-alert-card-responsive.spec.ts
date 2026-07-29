import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  E2E_BOARD_CODE,
  E2E_LINE_NUMBER,
  E2E_MACHINE_ID,
  E2E_OPERATOR_BADGE,
  E2E_RESPONSABLE_BADGE,
  E2E_WORKSHOP_PASSWORD,
} from './fixtures';

test.describe.configure({ retries: 0 });

const VIEWPORTS = [
  { name: '320x844', width: 320, height: 844 },
  { name: '359x844', width: 359, height: 844 },
  { name: '390x844', width: 390, height: 844 },
  { name: '640x720', width: 640, height: 720 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1620x928', width: 1620, height: 928 },
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

async function createIncident(
  page: Page,
  options: { head: number; product: string; state: string; comment: string }
): Promise<void> {
  await page.getByRole('button', { name: '+ Créer un incident' }).click();
  await chooseSelectField(page, 'Ligne', E2E_LINE_NUMBER);
  await chooseSelectField(page, 'Machine', new RegExp(E2E_MACHINE_ID));
  await chooseSelectField(page, 'Robot', '1');
  await chooseSelectField(page, 'Tête', String(options.head));
  await chooseSelectField(page, 'État', options.state);
  await page.getByPlaceholder('Référence produit').fill(options.product);
  await page.getByLabel('Commentaire').fill(options.comment);
  await page.getByRole('button', { name: 'Aperçu' }).click();
  await page.getByRole('button', { name: 'Valider la création' }).click();
  await expect(page.getByRole('status')).toContainText('Incident signalé.');
}

async function declareUrgent(page: Page, product: string): Promise<void> {
  const card = page.locator('article.incident-card', { hasText: product });
  await expect(card).toBeVisible();
  await card.getByRole('link', { name: /Ouvrir incident/i }).click();
  const panel = page.locator('aside.incident-detail-drawer');
  await panel.getByRole('button', { name: 'Déclarer urgent' }).click();
  await expect(panel.getByRole('button', { name: "Retirer l'urgence" })).toBeVisible();
  await panel.getByRole('button', { name: 'Fermer le détail' }).click();
}

async function requestCancelArbitration(
  page: Page,
  product: string,
  reason: string
): Promise<void> {
  const card = page.locator('article.incident-card', { hasText: product });
  await card.getByRole('link', { name: /Ouvrir incident/i }).click();
  const panel = page.locator('aside.incident-detail-drawer');
  await panel.getByRole('button', { name: "Demander l'annulation" }).click();
  const dialog = page.getByRole('dialog', { name: 'Demande d’annulation' });
  await dialog.getByLabel('Motif d’annulation *').fill(reason);
  await dialog.getByRole('button', { name: 'Envoyer la demande' }).click();
  await expect(page.getByRole('status')).toContainText('Demande d’annulation envoyée.');
  await panel.getByRole('button', { name: 'Fermer le détail' }).click();
}

async function requestEditArbitration(page: Page, product: string, comment: string): Promise<void> {
  const card = page.locator('article.incident-card', { hasText: product });
  await card.getByRole('link', { name: /Ouvrir incident/i }).click();
  const panel = page.locator('aside.incident-detail-drawer');
  await panel.getByRole('button', { name: 'Demander une correction' }).click();
  const editDialog = page.getByRole('dialog', { name: "Modifier l'incident" });
  await editDialog.getByLabel('Commentaire').fill(comment);
  await editDialog.getByRole('button', { name: 'Aperçu' }).click();
  await page.getByRole('button', { name: 'Valider la modification' }).click();
  await expect(page.getByRole('status')).toContainText('Demande de correction envoyée.');
  await panel.getByRole('button', { name: 'Fermer le détail' }).click();
}

async function enterBoard(page: Page): Promise<void> {
  await page.goto('/board');
  await page.getByLabel("Code d'accès").fill(E2E_BOARD_CODE);
  await page.getByRole('button', { name: 'Accéder au tableau' }).click();
  await expect(page.locator('main.board-page')).toBeVisible();
}

async function openWorkshopFixture(page: Page, productPrefix: string) {
  const card = page.locator('article.incident-card', { hasText: productPrefix });
  await expect(card).toHaveCount(1);
  await card.getByRole('link', { name: /Ouvrir incident/i }).click();
  return { card, panel: page.locator('aside.incident-detail-drawer') };
}

async function cancelOpenIncident(page: Page): Promise<void> {
  const panel = page.locator('aside.incident-detail-drawer');
  await panel.getByRole('button', { name: "Annuler l'incident" }).click();
  const dialog = page.getByRole('dialog', { name: "Annuler l'incident" });
  await dialog.getByRole('button', { name: 'Confirmer l’annulation' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('status')).toContainText(
    'Incident annulé et conservé dans l’historique.'
  );
}

test.afterAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);

    const { card: cancelCard } = await openWorkshopFixture(page, 'E2E-BOARD-CANCEL');
    const cancellationReview = page.getByRole('dialog', {
      name: 'Arbitrage annulation',
    });
    await expect(cancellationReview).toBeVisible();
    await cancellationReview.getByRole('button', { name: "Confirmer l'annulation" }).click();
    await expect(cancelCard).toHaveCount(0);

    await openWorkshopFixture(page, 'E2E-BOARD-EDIT');
    const editReview = page.getByRole('dialog', { name: 'Arbitrage correction' });
    await expect(editReview).toBeVisible();
    await editReview.getByRole('button', { name: 'Appliquer la correction' }).click();
    await expect(editReview).toBeHidden();
    await cancelOpenIncident(page);

    await openWorkshopFixture(page, 'E2E-BOARD-PLAIN');
    await cancelOpenIncident(page);

    await page.goto('/workshop/dashboard');
    for (const productPrefix of ['E2E-BOARD-CANCEL', 'E2E-BOARD-EDIT', 'E2E-BOARD-PLAIN']) {
      await expect(page.locator('article.incident-card', { hasText: productPrefix })).toHaveCount(
        0
      );
    }
  } finally {
    await context.close();
  }
});

/**
 * Configure le Board pour un accès déterministe aux cartes de test : filtre
 * "Urgences uniquement" (les deux fiches créées sont urgentes) et pagination
 * réduite, sans dépendre du timer de rotation automatique.
 */
async function configureBoardForDeterministicAccess(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Réglages' }).click();
  const dialog = page.getByRole('dialog', { name: "Paramètres d'affichage" });
  await dialog.getByRole('checkbox', { name: 'Urgences uniquement' }).check();
  // Le combobox "Incidents par page" n'a pas de nom accessible (label non
  // associé, hors du scope de ce lot) : ciblé par le groupe portant son
  // libellé visible, en y prenant le seul combobox qu'il contient.
  const rowsPerPageGroup = dialog.locator('div', { hasText: 'Incidents par page' }).last();
  await rowsPerPageGroup.getByRole('combobox').click();
  await page.getByRole('option', { name: '4 lignes — petit écran', exact: true }).click();
  await dialog.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialog).toBeHidden();
}

async function findOverflowOffenders(
  card: import('@playwright/test').Locator
): Promise<{ selector: string; right: number; width: number }[]> {
  return card.evaluate((cardEl) => {
    const results: { selector: string; right: number; width: number }[] = [];
    const clientWidth = document.documentElement.clientWidth;
    cardEl.querySelectorAll<HTMLElement>('*').forEach((el) => {
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

test.describe('Board — préparation des fiches (RC5-7)', () => {
  test('setup : incident urgent, INDISPONIBLE, avec demande d’annulation à arbitrer', async ({
    page,
  }) => {
    const product = `E2E-BOARD-CANCEL-${Date.now()}`;
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await createIncident(page, {
      head: 5,
      product,
      state: 'Indisponible',
      comment: 'Incident E2E pour la géométrie des badges du Board (cas annulation).',
    });

    // Urgent déclaré avant la demande d'arbitrage : le modal de revue
    // automatique (réservé au responsable) ne se déclenche que s'il existe déjà
    // une demande active au moment de la sélection du dossier — cet ordre
    // l'évite proprement, sans dépendre d'un contournement de modal.
    await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
    await declareUrgent(page, product);

    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await requestCancelArbitration(page, product, 'Doublon E2E à vérifier avant annulation.');
  });

  test('setup : incident urgent, INDISPONIBLE, avec demande de modification à arbitrer', async ({
    page,
  }) => {
    const product = `E2E-BOARD-EDIT-${Date.now()}`;
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await createIncident(page, {
      head: 13,
      product,
      state: 'Indisponible',
      comment: 'Incident E2E pour la géométrie des badges du Board (cas modification).',
    });

    await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
    await declareUrgent(page, product);

    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await requestEditArbitration(page, product, 'Commentaire corrigé E2E RC5.');
  });

  test('setup : incident simple avec consigne longue, sans badge', async ({ page }) => {
    const product = `E2E-BOARD-PLAIN-${Date.now()}`;
    await loginAsWorkshop(page, E2E_OPERATOR_BADGE);
    await createIncident(page, {
      head: 14,
      product,
      state: 'Dégradée',
      comment: 'Incident E2E simple pour le cas sans badge (géométrie Board).',
    });

    await loginAsWorkshop(page, E2E_RESPONSABLE_BADGE);
    const card = page.locator('article.incident-card', { hasText: product });
    await card.getByRole('link', { name: /Ouvrir incident/i }).click();
    const panel = page.locator('aside.incident-detail-drawer');
    const longInstruction =
      'Consigne responsable volontairement longue pour vérifier que le pied de carte et la section consigne du Board restent lisibles sans troncature ni débordement, même avec plusieurs phrases consécutives et des détails opérationnels précis.';
    await panel.getByLabel('Consigne du responsable').fill(longInstruction);
    await panel.getByRole('button', { name: 'Ajouter' }).click();
    await expect(page.getByRole('status')).toContainText('Consigne enregistrée.');
    await panel.getByRole('button', { name: 'Fermer le détail' }).click();
  });
});

test.describe('Board — preuve rouge : cumul état long + Urgent + arbitrage (RC5-7)', () => {
  test('à 359px, l’en-tête cumulatif déborde, chevauche ou dépasse la carte', async ({ page }) => {
    await page.setViewportSize({ width: 359, height: 844 });
    await enterBoard(page);
    await configureBoardForDeterministicAccess(page);

    const card = page.locator('.board-incident-card', { hasText: 'E2E-BOARD-CANCEL' });
    await expect(card).toBeVisible();

    const cardGeometry = await card.evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    await test.info().attach('board-card-359-geometry', {
      body: JSON.stringify(cardGeometry, null, 2),
      contentType: 'application/json',
    });

    const offenders = await findOverflowOffenders(card);
    await test.info().attach('board-card-359-offenders', {
      body: JSON.stringify(offenders, null, 2),
      contentType: 'application/json',
    });

    const detailedGeometry = await card.evaluate((el) => {
      function box(selector: string) {
        const node = el.querySelector(selector);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return {
          text: node.textContent,
          x: Math.round(rect.x),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      }
      return {
        top: box('.board-incident-top'),
        topStatus: box('.board-incident-top-status'),
        strong: box('.board-incident-top > strong'),
        state: box('.board-incident-state'),
        priority: box('.board-chip-priority'),
        arbitration: box('.board-chip-arbitration'),
      };
    });
    await test.info().attach('board-card-359-detailed', {
      body: JSON.stringify(detailedGeometry, null, 2),
      contentType: 'application/json',
    });

    // Contrat RC5 : aucun débordement de la carte, aucun élément qui dépasse
    // son rectangle. Avant correction, ce test échoue (débordement mesuré).
    expect(
      cardGeometry.scrollWidth,
      `la carte ne doit pas déborder horizontalement à 359px (offenders: ${JSON.stringify(offenders)})`
    ).toBeLessThanOrEqual(cardGeometry.clientWidth + 1);
    expect(offenders, 'aucun élément ne doit dépasser le rectangle de la carte').toEqual([]);

    // Aucune intersection entre le numéro de ligne/état et les badges.
    const lineLabel = card.locator('.board-incident-top > strong');
    const stateLabel = card.locator('.board-incident-state');
    const urgentChip = card.locator('.board-chip-priority');
    const arbitrationChip = card.locator('.board-chip-arbitration');
    const [lineBox, stateBox, urgentBox, arbitrationBox] = await Promise.all([
      lineLabel.boundingBox(),
      stateLabel.boundingBox(),
      urgentChip.boundingBox(),
      arbitrationChip.boundingBox(),
    ]);
    expect(lineBox).not.toBeNull();
    expect(stateBox).not.toBeNull();
    expect(urgentBox).not.toBeNull();
    expect(arbitrationBox).not.toBeNull();

    function intersects(
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number }
    ): boolean {
      return (
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
      );
    }

    if (lineBox && arbitrationBox) {
      expect(
        intersects(lineBox, arbitrationBox),
        `le numéro de ligne ne doit pas chevaucher le badge d'arbitrage (line=${JSON.stringify(lineBox)}, arbitration=${JSON.stringify(arbitrationBox)})`
      ).toBe(false);
    }
    if (urgentBox && arbitrationBox) {
      expect(
        intersects(urgentBox, arbitrationBox),
        'le badge Urgent ne doit pas chevaucher le badge d’arbitrage'
      ).toBe(false);
    }
    if (stateBox && urgentBox) {
      expect(intersects(stateBox, urgentBox), 'l’état ne doit pas chevaucher le badge Urgent').toBe(
        false
      );
    }
    if (lineBox && stateBox) {
      expect(
        intersects(lineBox, stateBox),
        `le numéro de ligne ne doit pas chevaucher l'état machine (line=${JSON.stringify(lineBox)}, state=${JSON.stringify(stateBox)})`
      ).toBe(false);
    }
  });

  test('à 359px, le cas « Modification à arbitrer » ne déborde ni ne chevauche', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 359, height: 844 });
    await enterBoard(page);
    await configureBoardForDeterministicAccess(page);

    const card = page.locator('.board-incident-card', { hasText: 'E2E-BOARD-EDIT' });
    await expect(card).toBeVisible();

    const cardGeometry = await card.evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    const offenders = await findOverflowOffenders(card);
    await test.info().attach('board-card-359-edit-geometry', {
      body: JSON.stringify({ ...cardGeometry, offenders }, null, 2),
      contentType: 'application/json',
    });

    expect(
      cardGeometry.scrollWidth,
      `la carte ne doit pas déborder horizontalement à 359px (offenders: ${JSON.stringify(offenders)})`
    ).toBeLessThanOrEqual(cardGeometry.clientWidth + 1);
    expect(offenders).toEqual([]);

    const lineLabel = card.locator('.board-incident-top > strong');
    const stateLabel = card.locator('.board-incident-state');
    const [lineBox, stateBox] = await Promise.all([
      lineLabel.boundingBox(),
      stateLabel.boundingBox(),
    ]);
    expect(lineBox).not.toBeNull();
    expect(stateBox).not.toBeNull();
    if (lineBox && stateBox) {
      const intersects =
        lineBox.x < stateBox.x + stateBox.width &&
        lineBox.x + lineBox.width > stateBox.x &&
        lineBox.y < stateBox.y + stateBox.height &&
        lineBox.y + lineBox.height > stateBox.y;
      expect(
        intersects,
        `le numéro de ligne ne doit pas chevaucher l'état machine (line=${JSON.stringify(lineBox)}, state=${JSON.stringify(stateBox)})`
      ).toBe(false);
    }
  });
});

async function assertCardGeometry(
  card: import('@playwright/test').Locator,
  label: string
): Promise<void> {
  const cardGeometry = await card.evaluate((el) => ({
    clientWidth: el.clientWidth,
    scrollWidth: el.scrollWidth,
  }));
  const offenders = await findOverflowOffenders(card);
  await test.info().attach(`board-card-${label}`, {
    body: JSON.stringify({ ...cardGeometry, offenders }, null, 2),
    contentType: 'application/json',
  });
  expect(
    cardGeometry.scrollWidth,
    `${label} : la carte ne doit pas déborder horizontalement (offenders: ${JSON.stringify(offenders)})`
  ).toBeLessThanOrEqual(cardGeometry.clientWidth + 1);
  expect(offenders, `${label} : aucun élément ne doit dépasser le rectangle de la carte`).toEqual(
    []
  );

  const cardBox = await card.boundingBox();
  expect(cardBox, `${label} : la carte doit avoir une géométrie mesurable`).not.toBeNull();
  const badges = card.locator('.board-chip');
  const badgeCount = await badges.count();
  if (cardBox) {
    for (let i = 0; i < badgeCount; i += 1) {
      const box = await badges.nth(i).boundingBox();
      expect(box, `${label} : badge #${i} doit être visible`).not.toBeNull();
      if (box) {
        expect(box.x, `${label} : bord gauche du badge #${i} dans la carte`).toBeGreaterThanOrEqual(
          cardBox.x - 1
        );
        expect(
          box.x + box.width,
          `${label} : bord droit du badge #${i} dans la carte`
        ).toBeLessThanOrEqual(cardBox.x + cardBox.width + 1);
      }
    }
  }
}

test.describe('Board — géométrie multi-viewports (RC5-7)', () => {
  for (const viewport of VIEWPORTS) {
    test(`aucun débordement ni chevauchement à ${viewport.name}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await enterBoard(page);
      await configureBoardForDeterministicAccess(page);

      // Pagination réelle : "Urgences uniquement" + 4 par page place déjà les
      // deux cartes urgentes (CANCEL, EDIT) sur la première page. On vérifie
      // les deux, garantissant l'accès à un cas complexe sans dépendre du
      // timer de rotation automatique.
      const cancelCard = page.locator('.board-incident-card', { hasText: 'E2E-BOARD-CANCEL' });
      const editCard = page.locator('.board-incident-card', { hasText: 'E2E-BOARD-EDIT' });
      await expect(cancelCard).toBeVisible();
      await expect(editCard).toBeVisible();

      await assertCardGeometry(cancelCard, `${viewport.name}-cancel`);
      await assertCardGeometry(editCard, `${viewport.name}-edit`);

      // Aucun débordement horizontal du document entier à cette largeur.
      const doc = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(
        doc.scrollWidth,
        `${viewport.name} : le document ne doit pas déborder horizontalement`
      ).toBeLessThanOrEqual(doc.clientWidth + 1);

      // Le contenu Produit/Équipement doit commencer sous l'intégralité de
      // l'en-tête (aucune intersection top/produit).
      const topBox = await cancelCard.locator('.board-incident-top').boundingBox();
      const productBox = await cancelCard.locator('.board-incident-product').boundingBox();
      expect(topBox).not.toBeNull();
      expect(productBox).not.toBeNull();
      if (topBox && productBox) {
        expect(
          productBox.y,
          `${viewport.name} : le produit doit commencer sous l'en-tête complet`
        ).toBeGreaterThanOrEqual(topBox.y + topBox.height - 1);
      }
    });
  }

  test('cas simple sans badge : aucun espace vide inutile, pied de carte stable', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterBoard(page);

    // Vue "Tous les incidents" exclusivement, pagination maximale et cadence
    // de rotation minimale (5 s), pour atteindre la fiche simple (non
    // urgente) via la pagination automatique réelle du Board — pas de
    // contrôle "page suivante" manuel dans cette UI (rotation par timer).
    await page.getByRole('button', { name: 'Réglages' }).click();
    const dialog = page.getByRole('dialog', { name: "Paramètres d'affichage" });
    await dialog.getByRole('checkbox', { name: 'Alertes à traiter' }).uncheck();
    await dialog.getByRole('checkbox', { name: 'Tous les incidents ouverts' }).check();
    await dialog.getByRole('checkbox', { name: 'Situation par ligne' }).uncheck();
    await dialog.locator('input[type="range"]').fill('5');
    const rowsPerPageGroup = dialog.locator('div', { hasText: 'Incidents par page' }).last();
    await rowsPerPageGroup.getByRole('combobox').click();
    await page.getByRole('option', { name: '4 lignes — petit écran', exact: true }).click();
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toBeHidden();

    // Pagination réelle (rotation automatique) : on attend que la fiche
    // apparaisse au fil des pages, sans borner arbitrairement le temps.
    const plainCard = page.locator('.board-incident-card', { hasText: 'E2E-BOARD-PLAIN' });
    await expect(plainCard).toBeVisible({ timeout: 45_000 });
    await assertCardGeometry(plainCard, 'plain-1440');

    // Aucun badge Urgent ni arbitrage sur cette carte.
    expect(await plainCard.locator('.board-chip-priority').count()).toBe(0);
    expect(await plainCard.locator('.board-chip-arbitration').count()).toBe(0);

    // Pied de carte : statut "Non pris" stable et visible.
    const footer = plainCard.locator('.board-incident-footer');
    await expect(footer).toBeVisible();
    await expect(footer.getByText('Non pris')).toBeVisible();
  });

  test('grille desktop 3 colonnes : une carte plus haute garde la rangée cohérente', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1620, height: 928 });
    await enterBoard(page);
    await configureBoardForDeterministicAccess(page);

    const cancelCard = page.locator('.board-incident-card', { hasText: 'E2E-BOARD-CANCEL' });
    await expect(cancelCard).toBeVisible();
    const cancelBox = await cancelCard.boundingBox();
    expect(cancelBox).not.toBeNull();

    // Une carte simple de la même rangée (première position, grille 3
    // colonnes) doit avoir la même hauteur que la carte cumulative, grâce à
    // align-items: stretch + grid-auto-rows sur .board-incident-grid.
    const grid = page.locator('.board-incident-grid');
    const firstCardBox = await grid.locator('.board-incident-card').first().boundingBox();
    expect(firstCardBox).not.toBeNull();
    if (cancelBox && firstCardBox) {
      expect(
        Math.abs(firstCardBox.height - cancelBox.height),
        'les cartes de la même rangée doivent partager la même hauteur (grid stretch)'
      ).toBeLessThanOrEqual(1);
    }
  });

  test('accessibilité (axe-core) : aucune violation sérieuse ou critique avec badges cumulés', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await enterBoard(page);
    await configureBoardForDeterministicAccess(page);

    const cancelCard = page.locator('.board-incident-card', { hasText: 'E2E-BOARD-CANCEL' });
    await expect(cancelCard).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('lecture complète des libellés : aucun texte métier tronqué par ellipsis', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 359, height: 844 });
    await enterBoard(page);
    await configureBoardForDeterministicAccess(page);

    const cancelCard = page.locator('.board-incident-card', { hasText: 'E2E-BOARD-CANCEL' });
    await expect(cancelCard).toBeVisible();
    await expect(cancelCard.getByText('Indisponible')).toBeVisible();
    await expect(cancelCard.getByText('Urgent')).toBeVisible();
    await expect(cancelCard.getByText('Annulation à arbitrer')).toBeVisible();

    const editCard = page.locator('.board-incident-card', { hasText: 'E2E-BOARD-EDIT' });
    await expect(editCard.getByText('Modification à arbitrer')).toBeVisible();
  });

  test('la pagination reste réglable et l’accès aux cartes complexes reste réel', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await enterBoard(page);
    await configureBoardForDeterministicAccess(page);

    // Page réellement affichée après réglage (1/1 avec 2 cartes urgentes sur
    // 4 par page), pas une capture figée sur la première page par défaut.
    await expect(page.getByText('Page 1/1', { exact: true })).toBeVisible();
    await expect(
      page.locator('.board-incident-card', { hasText: 'E2E-BOARD-CANCEL' })
    ).toBeVisible();
    await expect(page.locator('.board-incident-card', { hasText: 'E2E-BOARD-EDIT' })).toBeVisible();
  });
});
