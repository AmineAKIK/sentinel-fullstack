import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page, type Route } from '@playwright/test';
import { E2E_RESPONSABLE_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

test.describe.configure({ retries: 0 });

const VIEWPORTS = [
  { name: '320x640', width: 320, height: 640 },
  { name: '360x740', width: 360, height: 740 },
  { name: '390x844', width: 390, height: 844 },
  { name: '640x720', width: 640, height: 720 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1440x900', width: 1440, height: 900 },
] as const;

async function loginAsResponsable(page: Page): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(E2E_RESPONSABLE_BADGE);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
}

async function mockChatReply(page: Page, replyText: string): Promise<void> {
  await page.route('**/api/workshop/support/chat', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ reply: replyText }),
    });
  });
}

async function measureDocumentScroll(page: Page) {
  return page.evaluate(() => ({
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    scrollY: window.scrollY,
  }));
}

async function findOverflowOffenders(
  page: Page
): Promise<{ selector: string; right: number; bottom: number }[]> {
  return page.evaluate(() => {
    const results: { selector: string; right: number; bottom: number }[] = [];
    const clientWidth = document.documentElement.clientWidth;
    const clientHeight = document.documentElement.clientHeight;
    document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.right > clientWidth + 1) {
        const cls = typeof el.className === 'string' ? el.className : '';
        results.push({
          selector: `${el.tagName.toLowerCase()}${cls ? '.' + cls.split(' ').join('.') : ''}`,
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
        });
      }
    });
    return results;
  });
}

test.describe('Assistant Sentinel — preuves rouges (RC5-9)', () => {
  test('à 360×500 (hauteur visuelle réduite, chrome navigateur mobile déduite), le document déborde', async ({
    page,
  }) => {
    // 360×740 correspond au viewport CSS nominal du téléphone photographié,
    // mais un vrai navigateur mobile réduit la hauteur visuelle réelle
    // (barre d'adresse + barre de navigation, souvent 150-250px). 360×500
    // reproduit fidèlement cet espace réellement disponible, sans quoi le
    // défaut de calc(100vh - 56px) + min-heights cumulées ne se manifeste
    // pas dans un simulateur qui ignore la chrome dynamique du navigateur.
    await page.setViewportSize({ width: 360, height: 500 });
    await loginAsResponsable(page);
    await page.goto('/workshop/support');
    await expect(page.getByText('Assistant Sentinel')).toBeVisible();

    const doc = await measureDocumentScroll(page);
    await test.info().attach('document-360-500-empty', {
      body: JSON.stringify(doc, null, 2),
      contentType: 'application/json',
    });

    // Contrat RC5 : ni débordement du document, ni scroll requis pour
    // atteindre le compositeur. Avant correction, ce test échoue.
    expect(doc.scrollHeight, 'le document ne doit pas déborder verticalement').toBeLessThanOrEqual(
      doc.clientHeight + 1
    );
    expect(doc.scrollY, 'aucun scroll ne doit être nécessaire à l’ouverture').toBe(0);

    const composerBox = await page.locator('.support-composer').boundingBox();
    expect(composerBox, 'le compositeur doit être mesurable').not.toBeNull();
    if (composerBox) {
      expect(
        composerBox.y + composerBox.height,
        'le compositeur doit être entièrement dans le viewport'
      ).toBeLessThanOrEqual(doc.clientHeight + 1);
    }
  });

  test('à hauteur réduite, un scroll du document serait nécessaire pour atteindre le compositeur', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 500 });
    await loginAsResponsable(page);
    await page.goto('/workshop/support');
    await expect(page.getByText('Assistant Sentinel')).toBeVisible();

    const doc = await measureDocumentScroll(page);
    const composerBox = await page.locator('.support-composer').boundingBox();
    expect(composerBox).not.toBeNull();
    await test.info().attach('composer-reach-360-500', {
      body: JSON.stringify({ doc, composerBox }, null, 2),
      contentType: 'application/json',
    });
    if (composerBox) {
      const composerBottomBeyondViewport = composerBox.y + composerBox.height > doc.clientHeight;
      // Contrat RC5 : jamais besoin de faire défiler le document pour
      // atteindre le compositeur. Avant correction, ce test échoue.
      expect(
        composerBottomBeyondViewport,
        `le compositeur ne doit jamais dépasser le bas du viewport (composerBox=${JSON.stringify(composerBox)}, viewport clientHeight=${doc.clientHeight})`
      ).toBe(false);
    }
  });

  test('le "?" du titre ne reste pas seul sur sa ligne', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await loginAsResponsable(page);
    await page.goto('/workshop/support');

    const title = page.locator('.support-empty-title');
    await expect(title).toBeVisible();
    const lastLineIsolated = await title.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const rects = Array.from(range.getClientRects());
      if (rects.length < 2) return false;
      const lastRect = rects[rects.length - 1];
      // Une ligne isolée composée uniquement de "?" est nettement plus
      // étroite que les lignes précédentes.
      const previousWidths = rects.slice(0, -1).map((r) => r.width);
      const maxPrevious = Math.max(...previousWidths);
      return lastRect.width < maxPrevious * 0.15;
    });
    expect(lastLineIsolated, 'le "?" ne doit pas apparaître seul sur sa propre ligne').toBe(false);
  });

  test('arrivée depuis une route dont le scroll est positif : la page Assistant repart bien à 0', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 500 });
    await loginAsResponsable(page);

    // Positionne un vrai scroll sur une autre route avant la navigation : le
    // dashboard atelier, chargé avec les fixtures E2E, dépasse réellement la
    // hauteur réduite du viewport.
    await page.goto('/workshop/dashboard');
    await expect(page.locator('.incident-card').first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(
      scrollBefore,
      'le dashboard doit réellement être scrollable avant ce scénario'
    ).toBeGreaterThan(0);

    // Largeur réduite : la navigation se fait via le menu hamburger.
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await page.getByRole('link', { name: 'Assistance' }).click();
    await page.waitForURL('**/workshop/support');
    await expect(page.getByText('Assistant Sentinel')).toBeVisible();

    const doc = await measureDocumentScroll(page);
    await test.info().attach('document-360-500-after-navigation', {
      body: JSON.stringify(doc, null, 2),
      contentType: 'application/json',
    });
    expect(doc.scrollY, 'la nouvelle route doit repartir en haut du document').toBe(0);
  });
});

test.describe('Assistant Sentinel — géométrie multi-viewports, conversation vide (RC5-9)', () => {
  for (const viewport of VIEWPORTS) {
    test(`aucun débordement, compositeur visible, à ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await loginAsResponsable(page);
      await page.goto('/workshop/support');
      await expect(page.getByText('Assistant Sentinel')).toBeVisible();

      const doc = await measureDocumentScroll(page);
      const offenders = await findOverflowOffenders(page);
      await test.info().attach(`document-${viewport.name}-empty`, {
        body: JSON.stringify({ ...doc, offenders }, null, 2),
        contentType: 'application/json',
      });

      expect(
        doc.scrollHeight,
        `${viewport.name} : le document ne doit pas déborder verticalement (offenders: ${JSON.stringify(offenders)})`
      ).toBeLessThanOrEqual(doc.clientHeight + 1);
      expect(doc.scrollY, `${viewport.name} : aucun scroll requis à l’ouverture`).toBe(0);
      expect(offenders, `${viewport.name} : aucun débordement horizontal`).toEqual([]);

      const navBox = await page.locator('.nav-bar').boundingBox();
      const layoutBox = await page.locator('.support-layout').boundingBox();
      expect(navBox).not.toBeNull();
      expect(layoutBox).not.toBeNull();
      if (navBox && layoutBox) {
        expect(
          layoutBox.y,
          `${viewport.name} : la carte Assistant doit commencer sous le header`
        ).toBeGreaterThanOrEqual(navBox.y + navBox.height - 1);
      }

      // Identité complète visible : logo, nom, description, statut.
      await expect(page.locator('.support-agent-mark')).toBeVisible();
      await expect(page.getByText('Assistant Sentinel')).toBeVisible();
      await expect(page.getByText("Aide sur l'utilisation de l'application")).toBeVisible();
      await expect(page.getByText('Disponible')).toBeVisible();

      // Compositeur entièrement dans le viewport.
      const composerBox = await page.locator('.support-composer').boundingBox();
      expect(composerBox).not.toBeNull();
      if (composerBox) {
        expect(
          composerBox.y + composerBox.height,
          `${viewport.name} : le compositeur doit être entièrement visible`
        ).toBeLessThanOrEqual(doc.clientHeight + 1);
      }
    });
  }
});

test.describe('Assistant Sentinel — conversation longue (RC5-9)', () => {
  test('seule la conversation défile, le document reste immobile, le compositeur reste visible', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await loginAsResponsable(page);

    const longReply =
      'Réponse détaillée. '.repeat(40) +
      '\n\n' +
      'Paragraphe supplémentaire pour garantir un dépassement réel de la zone de conversation visible, avec suffisamment de texte pour forcer un vrai scroll interne.';
    await mockChatReply(page, longReply);

    await page.goto('/workshop/support');
    const textarea = page.getByRole('textbox', { name: 'Message' });

    // Plusieurs échanges réels pour dépasser la hauteur disponible.
    for (let i = 0; i < 6; i += 1) {
      await textarea.fill(`Question numéro ${i + 1} suffisamment longue pour occuper de la place.`);
      await textarea.press('Enter');
      await expect(page.getByRole('status')).toContainText('Message envoyé.');
    }

    const messagesBox = await page.locator('.support-messages').evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    await test.info().attach('conversation-longue-360-740', {
      body: JSON.stringify(messagesBox, null, 2),
      contentType: 'application/json',
    });
    expect(
      messagesBox.scrollHeight,
      'la conversation doit réellement dépasser sa hauteur visible'
    ).toBeGreaterThan(messagesBox.clientHeight);

    const doc = await measureDocumentScroll(page);
    expect(doc.scrollHeight, 'le document ne doit toujours pas déborder').toBeLessThanOrEqual(
      doc.clientHeight + 1
    );
    expect(doc.scrollY, 'le document ne doit pas avoir bougé').toBe(0);

    const composerBox = await page.locator('.support-composer').boundingBox();
    expect(composerBox).not.toBeNull();
    if (composerBox) {
      expect(
        composerBox.y + composerBox.height,
        'le compositeur reste entièrement visible malgré la conversation longue'
      ).toBeLessThanOrEqual(doc.clientHeight + 1);
    }

    const navBox = await page.locator('.nav-bar').boundingBox();
    const chatHeaderBox = await page.locator('.support-chat-header').boundingBox();
    expect(navBox).not.toBeNull();
    expect(chatHeaderBox).not.toBeNull();
    if (navBox && chatHeaderBox) {
      expect(
        chatHeaderBox.y,
        'l’identité Assistant ne doit jamais passer sous le header'
      ).toBeGreaterThanOrEqual(navBox.y + navBox.height - 1);
    }
  });
});

test.describe('Assistant Sentinel — viewport dynamique (RC5-9)', () => {
  test('réduction puis agrandissement de hauteur : compositeur toujours accessible, pas de double scrollbar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsResponsable(page);
    await page.goto('/workshop/support');
    await expect(page.getByText('Assistant Sentinel')).toBeVisible();

    // Simule la réduction du viewport visuel (barre d'adresse mobile qui
    // apparaît, ou clavier virtuel qui s'ouvre).
    await page.setViewportSize({ width: 390, height: 500 });
    await page.waitForFunction(() => window.innerHeight === 500);

    let doc = await measureDocumentScroll(page);
    let composerBox = await page.locator('.support-composer').boundingBox();
    expect(composerBox).not.toBeNull();
    if (composerBox) {
      expect(
        composerBox.y,
        'le compositeur doit rester dans les limites du viewport réduit'
      ).toBeGreaterThanOrEqual(0);
    }
    expect(doc.scrollHeight).toBeLessThanOrEqual(doc.clientHeight + 1);

    // Réagrandissement : aucun calcul de hauteur obsolète, aucune double
    // scrollbar résiduelle.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => window.innerHeight === 844);

    doc = await measureDocumentScroll(page);
    composerBox = await page.locator('.support-composer').boundingBox();
    expect(
      doc.scrollHeight,
      'aucun résidu de hauteur obsolète après réagrandissement'
    ).toBeLessThanOrEqual(doc.clientHeight + 1);
    expect(composerBox).not.toBeNull();
    if (composerBox) {
      expect(composerBox.y + composerBox.height).toBeLessThanOrEqual(doc.clientHeight + 1);
    }
  });
});

test.describe('Assistant Sentinel — accessibilité et clavier (RC5-9)', () => {
  test('navigation clavier réelle jusqu’au compositeur, focus visible', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await loginAsResponsable(page);
    await page.goto('/workshop/support');

    const textarea = page.getByRole('textbox', { name: 'Message' });
    await textarea.focus();
    await expect(textarea).toBeFocused();

    const doc = await measureDocumentScroll(page);
    expect(doc.scrollY, 'la prise de focus ne doit pas déplacer le document').toBe(0);
  });

  test('aucune violation axe-core sérieuse ou critique, conversation vide', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await loginAsResponsable(page);
    await page.goto('/workshop/support');
    await expect(page.getByText('Assistant Sentinel')).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const blocking = results.violations.filter(
      (violation) => violation.impact === 'serious' || violation.impact === 'critical'
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
