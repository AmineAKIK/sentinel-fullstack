import { expect, test, type Locator, type Page } from '@playwright/test';
import { E2E_OPERATOR_BADGE, E2E_WORKSHOP_PASSWORD } from './fixtures';

type Box = {
  x: number;
  y: number;
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type PanelMetrics = {
  label: string;
  innerWidth: number;
  innerHeight: number;
  scrollY: number;
  documentScrollWidth: number;
  documentScrollHeight: number;
  drawerMarginTop: string;
  drawerOffsetProperty: string;
  drawer: Box;
  topbar: Box;
  navigation: Box;
  counter: Box;
  closeButton: Box;
  navigationBar: Box;
  body: Box & {
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
    overflowY: string;
    overscrollBehaviorY: string;
    scrollbarGutter: string;
  };
};

const REMOVED_DRAWER_OFFSET_PROPERTY = ['--incident-detail', 'offset-top'].join('-');

test.describe.configure({ retries: 0 });

async function loginAsOperator(page: Page): Promise<void> {
  await page.goto('/workshop/login');
  await page.getByLabel('Numéro de badge').fill(E2E_OPERATOR_BADGE);
  await page.getByRole('button', { name: 'Continuer' }).click();
  await page.getByLabel('Mot de passe').fill(E2E_WORKSHOP_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL('**/workshop/dashboard');
  await expect(page.locator('article.incident-card').first()).toBeVisible();
}

async function nextPaint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      })
  );
}

async function armDrawerInsertionProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    type ProbeWindow = Window & {
      __r4DrawerInsertion?: {
        innerWidth: number;
        documentScrollWidth: number;
        drawer: {
          x: number;
          y: number;
          top: number;
          right: number;
          bottom: number;
          left: number;
          width: number;
          height: number;
        };
      } | null;
    };
    const probeWindow = window as ProbeWindow;
    probeWindow.__r4DrawerInsertion = null;
    const observer = new MutationObserver(() => {
      const drawer = document.querySelector('aside.incident-detail-drawer');
      if (!drawer) return;
      const rect = drawer.getBoundingClientRect();
      probeWindow.__r4DrawerInsertion = {
        innerWidth: window.innerWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        drawer: {
          x: rect.x,
          y: rect.y,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      };
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function readDrawerInsertionProbe(page: Page) {
  const probe = await page.evaluate(() => {
    const probeWindow = window as Window & {
      __r4DrawerInsertion?: {
        innerWidth: number;
        documentScrollWidth: number;
        drawer: Box;
      } | null;
    };
    return probeWindow.__r4DrawerInsertion ?? null;
  });
  expect(probe).not.toBeNull();
  console.log(`[R4-03] ${JSON.stringify({ label: 'zoom-200-insertion', ...probe })}`);
  return probe!;
}

async function openCardFromMetadata(
  page: Page,
  card: Locator,
  options: { ensureCardInView?: boolean } = {}
): Promise<{ scrollYBefore: number; trigger: Locator }> {
  if (options.ensureCardInView !== false) await card.scrollIntoViewIfNeeded();
  const metadata = card.locator('.incident-card-meta');
  await expect(metadata).toBeVisible();
  const metadataBox = await metadata.boundingBox();
  expect(metadataBox).not.toBeNull();
  const scrollYBefore = await page.evaluate(() => window.scrollY);
  const trigger = card.getByRole('link', { name: /Ouvrir incident/i });

  await page.mouse.click(
    metadataBox!.x + metadataBox!.width / 2,
    metadataBox!.y + metadataBox!.height / 2
  );
  await expect(page.locator('aside.incident-detail-drawer')).toBeVisible();

  return { scrollYBefore, trigger };
}

async function measurePanel(page: Page, label: string): Promise<PanelMetrics> {
  const metrics = await page.evaluate(
    ({ snapshotLabel, removedDrawerOffsetProperty }) => {
      function requireElement<T extends Element>(selector: string): T {
        const element = document.querySelector<T>(selector);
        if (!element) throw new Error(`Élément de mesure absent : ${selector}`);
        return element;
      }

      function box(element: Element) {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        };
      }

      const drawer = requireElement<HTMLElement>('aside.incident-detail-drawer');
      const topbar = requireElement<HTMLElement>('.incident-detail-topbar');
      const navigation = requireElement<HTMLElement>('.incident-detail-nav');
      const counter = requireElement<HTMLElement>('.incident-detail-position');
      const closeButton = requireElement<HTMLButtonElement>(
        '.incident-detail-topbar button[aria-label="Fermer le détail"]'
      );
      const navigationBar = requireElement<HTMLElement>('.nav-bar');
      const body = requireElement<HTMLElement>('.incident-detail-content');
      const drawerStyle = window.getComputedStyle(drawer);
      const bodyStyle = window.getComputedStyle(body);

      return {
        label: snapshotLabel,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        scrollY: window.scrollY,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentScrollHeight: document.documentElement.scrollHeight,
        drawerMarginTop: drawerStyle.marginTop,
        drawerOffsetProperty: drawer.style.getPropertyValue(removedDrawerOffsetProperty),
        drawer: box(drawer),
        topbar: box(topbar),
        navigation: box(navigation),
        counter: box(counter),
        closeButton: box(closeButton),
        navigationBar: box(navigationBar),
        body: {
          ...box(body),
          clientHeight: body.clientHeight,
          scrollHeight: body.scrollHeight,
          scrollTop: body.scrollTop,
          overflowY: bodyStyle.overflowY,
          overscrollBehaviorY: bodyStyle.overscrollBehaviorY,
          scrollbarGutter: bodyStyle.scrollbarGutter,
        },
      };
    },
    { snapshotLabel: label, removedDrawerOffsetProperty: REMOVED_DRAWER_OFFSET_PROPERTY }
  );

  console.log(`[R4-03] ${JSON.stringify(metrics)}`);
  return metrics;
}

function expectBoxInsideViewport(box: Box, metrics: PanelMetrics): void {
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(metrics.innerWidth);
  expect(box.top).toBeGreaterThanOrEqual(metrics.navigationBar.bottom);
  expect(box.bottom).toBeLessThanOrEqual(metrics.innerHeight);
}

function expectPanelInsideViewport(metrics: PanelMetrics): void {
  expect(metrics.drawerOffsetProperty).toBe('');
  expect(metrics.drawerMarginTop).toBe('0px');
  expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.innerWidth);
  expectBoxInsideViewport(metrics.drawer, metrics);
  expectBoxInsideViewport(metrics.topbar, metrics);
  expectBoxInsideViewport(metrics.navigation, metrics);
  expectBoxInsideViewport(metrics.counter, metrics);
  expectBoxInsideViewport(metrics.closeButton, metrics);
  expect(metrics.body.left).toBeGreaterThanOrEqual(metrics.drawer.left);
  expect(metrics.body.right).toBeLessThanOrEqual(metrics.drawer.right);
  expect(metrics.body.top).toBeGreaterThanOrEqual(metrics.topbar.bottom);
  expect(metrics.body.bottom).toBeLessThanOrEqual(metrics.drawer.bottom);
}

for (const position of ['haut', 'milieu', 'bas'] as const) {
  test(`desktop 1440×900 — carte ${position} sans recentrage ni offset`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loginAsOperator(page);

    const cards = page.locator('article.incident-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(11);
    const index =
      position === 'haut' ? 0 : position === 'milieu' ? Math.floor((count - 1) / 2) : count - 1;
    const card = cards.nth(index);
    if (position === 'haut') {
      const metadataBox = await card.locator('.incident-card-meta').boundingBox();
      expect(metadataBox).not.toBeNull();
      const wheelDelta = Math.max(0, Math.ceil(metadataBox!.y - 160));
      await page.mouse.move(8, 450);
      await page.mouse.wheel(0, wheelDelta);
      await nextPaint(page);
    }
    const { scrollYBefore, trigger } = await openCardFromMetadata(page, card, {
      ensureCardInView: position !== 'haut',
    });
    await nextPaint(page);

    const metrics = await measurePanel(page, `desktop-${position}`);
    console.log(
      `[R4-03] ${JSON.stringify({
        label: `opening-scroll-${position}`,
        scrollYBefore,
        scrollYAfter: metrics.scrollY,
      })}`
    );
    expect(metrics.documentScrollHeight).toBeGreaterThan(metrics.innerHeight);
    expect(metrics.scrollY).toBe(scrollYBefore);
    expectPanelInsideViewport(metrics);

    if (position === 'milieu') {
      await page.keyboard.press('Escape');
    } else {
      await page.getByRole('button', { name: 'Fermer le détail' }).click();
    }
    await expect(page.locator('aside.incident-detail-drawer')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    const focusMetrics = await page.evaluate(() => {
      const activeElement = document.activeElement;
      return {
        tagName: activeElement?.tagName ?? null,
        className: activeElement instanceof HTMLElement ? activeElement.className : null,
        incidentCardId:
          activeElement instanceof HTMLElement
            ? activeElement
                .closest('[data-incident-card-id]')
                ?.getAttribute('data-incident-card-id')
            : null,
      };
    });
    console.log(`[R4-03] ${JSON.stringify({ label: `focus-${position}`, ...focusMetrics })}`);
  });
}

test('desktop — scroll page et vraie molette interne restent indépendants', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loginAsOperator(page);

  const longCard = page.locator('article.incident-card', { hasText: 'E2E-SCROLL-08' });
  await openCardFromMetadata(page, longCard);
  await nextPaint(page);

  const beforePageWheel = await measurePanel(page, 'desktop-page-before');
  const remainingPageScroll =
    beforePageWheel.documentScrollHeight - beforePageWheel.innerHeight - beforePageWheel.scrollY;

  await page.mouse.move(8, 450);
  await page.mouse.wheel(0, 240);
  await nextPaint(page);
  const afterPageDown = await measurePanel(page, 'desktop-page-down');

  await page.mouse.wheel(0, -160);
  await nextPaint(page);
  const afterPageUp = await measurePanel(page, 'desktop-page-up');

  await page.locator('.incident-detail-content').evaluate((element) => {
    element.scrollTop = 0;
  });
  const bodyBox = await page.locator('.incident-detail-content').boundingBox();
  expect(bodyBox).not.toBeNull();
  const beforeInternal = await measurePanel(page, 'desktop-internal-before');
  const consumableDelta = Math.min(
    240,
    beforeInternal.body.scrollHeight - beforeInternal.body.clientHeight - 1
  );

  await page.mouse.move(
    bodyBox!.x + bodyBox!.width / 2,
    bodyBox!.y + Math.min(bodyBox!.height / 2, 200)
  );
  await page.mouse.wheel(0, consumableDelta);
  await nextPaint(page);
  const afterInternal = await measurePanel(page, 'desktop-internal-consumed');

  await page.mouse.wheel(0, 10_000);
  await nextPaint(page);
  const atBottom = await measurePanel(page, 'desktop-internal-bottom');
  const pageYAtBottom = atBottom.scrollY;

  await page.mouse.wheel(0, 320);
  await nextPaint(page);
  const beyondBottom = await measurePanel(page, 'desktop-internal-contained');

  await page.mouse.wheel(0, -10_000);
  await nextPaint(page);
  const backAtTop = await measurePanel(page, 'desktop-internal-top');

  expect(remainingPageScroll).toBeGreaterThan(400);
  expect(afterPageDown.scrollY).toBeGreaterThan(beforePageWheel.scrollY);
  expect(afterPageUp.scrollY).toBeLessThan(afterPageDown.scrollY);
  expect(afterPageUp.drawer.top).toBe(afterPageDown.drawer.top);
  expect(beforeInternal.body.scrollHeight).toBeGreaterThan(beforeInternal.body.clientHeight);
  expect(consumableDelta).toBeGreaterThan(0);
  expect(afterInternal.body.scrollTop).toBeGreaterThan(0);
  expect(afterInternal.scrollY).toBe(beforeInternal.scrollY);
  expect(afterInternal.topbar).toEqual(beforeInternal.topbar);
  expect(afterInternal.navigation).toEqual(beforeInternal.navigation);
  expect(afterInternal.counter).toEqual(beforeInternal.counter);
  expect(afterInternal.closeButton).toEqual(beforeInternal.closeButton);
  expect(atBottom.body.scrollTop).toBeGreaterThan(afterInternal.body.scrollTop);
  expect(beyondBottom.body.scrollTop).toBe(atBottom.body.scrollTop);
  expect(beyondBottom.scrollY).toBe(pageYAtBottom);
  expect(beyondBottom.body.overscrollBehaviorY).toBe('contain');
  expect(beyondBottom.body.scrollbarGutter).toBe('stable');
  expect(backAtTop.body.scrollTop).toBe(0);
  expect(backAtTop.scrollY).toBe(pageYAtBottom);
  expectPanelInsideViewport(beforePageWheel);
  expectPanelInsideViewport(afterPageDown);
  expectPanelInsideViewport(afterPageUp);
  expectPanelInsideViewport(backAtTop);
});

test('zoom 200 % — ouverture à 640×720 sans débordement transitoire', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await loginAsOperator(page);

  const card = page.locator('article.incident-card', { hasText: 'E2E-SCROLL-08' });
  await armDrawerInsertionProbe(page);
  await openCardFromMetadata(page, card);
  const insertionMetrics = await readDrawerInsertionProbe(page);
  expect(insertionMetrics.drawer.left).toBeGreaterThanOrEqual(0);
  expect(insertionMetrics.drawer.right).toBeLessThanOrEqual(insertionMetrics.innerWidth);
  expect(insertionMetrics.drawer.top).toBeGreaterThanOrEqual(72);
  expect(insertionMetrics.drawer.bottom).toBeLessThanOrEqual(720);
  expect(insertionMetrics.documentScrollWidth).toBeLessThanOrEqual(insertionMetrics.innerWidth);
  const openingMetrics = await measurePanel(page, 'zoom-200-opening');
  expect(openingMetrics.drawer.right).toBeLessThanOrEqual(openingMetrics.innerWidth);
  expect(openingMetrics.documentScrollWidth).toBeLessThanOrEqual(openingMetrics.innerWidth);

  await nextPaint(page);
  const settledMetrics = await measurePanel(page, 'zoom-200-settled');
  expectPanelInsideViewport(settledMetrics);
});

test('mobile 390×844 — panneau borné, commandes visibles et corps parcourable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loginAsOperator(page);

  const card = page.locator('article.incident-card', { hasText: 'E2E-SCROLL-08' });
  await openCardFromMetadata(page, card);
  await nextPaint(page);
  const beforeWheel = await measurePanel(page, 'mobile-before-wheel');

  const bodyBox = await page.locator('.incident-detail-content').boundingBox();
  expect(bodyBox).not.toBeNull();
  await page.mouse.move(bodyBox!.x + bodyBox!.width / 2, bodyBox!.y + bodyBox!.height / 2);
  await page.mouse.wheel(0, 240);
  await nextPaint(page);
  const afterWheel = await measurePanel(page, 'mobile-after-wheel');
  expect(beforeWheel.body.scrollHeight).toBeGreaterThan(beforeWheel.body.clientHeight);
  expect(afterWheel.body.scrollTop).toBeGreaterThan(beforeWheel.body.scrollTop);
  expect(afterWheel.scrollY).toBe(beforeWheel.scrollY);
  expectPanelInsideViewport(beforeWheel);
  expectPanelInsideViewport(afterWheel);

  await page.setViewportSize({ width: 390, height: 500 });
  await nextPaint(page);
  const reducedViewport = await measurePanel(page, 'mobile-reduced-viewport');
  expectPanelInsideViewport(reducedViewport);
  expect(reducedViewport.body.scrollHeight).toBeGreaterThan(reducedViewport.body.clientHeight);
  expect(reducedViewport.scrollY).toBe(beforeWheel.scrollY);
  const reducedBodyBox = await page.locator('.incident-detail-content').boundingBox();
  expect(reducedBodyBox).not.toBeNull();
  await page.mouse.move(
    reducedBodyBox!.x + reducedBodyBox!.width / 2,
    reducedBodyBox!.y + reducedBodyBox!.height / 2
  );
  await page.mouse.wheel(0, 120);
  await nextPaint(page);
  const afterReducedWheel = await measurePanel(page, 'mobile-reduced-viewport-after-wheel');
  expect(afterReducedWheel.body.scrollTop).toBeGreaterThan(reducedViewport.body.scrollTop);
  expect(afterReducedWheel.scrollY).toBe(reducedViewport.scrollY);
  expectPanelInsideViewport(afterReducedWheel);
  const viewportContract = await page.locator('meta[name="viewport"]').getAttribute('content');
  expect(viewportContract?.split(',').map((token) => token.trim())).toContain(
    'interactive-widget=resizes-content'
  );
});

test('resize ouvert — aucune ancienne coordonnée entre desktop, mobile et desktop', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await loginAsOperator(page);

  const card = page.locator('article.incident-card', { hasText: 'E2E-SCROLL-08' });
  await openCardFromMetadata(page, card);
  await nextPaint(page);
  const desktopBefore = await measurePanel(page, 'resize-desktop-before');

  await page.setViewportSize({ width: 390, height: 844 });
  await nextPaint(page);
  const mobile = await measurePanel(page, 'resize-mobile');

  await page.setViewportSize({ width: 1440, height: 900 });
  await nextPaint(page);
  const desktopAfter = await measurePanel(page, 'resize-desktop-after');
  expectPanelInsideViewport(desktopBefore);
  expectPanelInsideViewport(mobile);
  expectPanelInsideViewport(desktopAfter);
  expect(mobile.scrollY).toBe(desktopBefore.scrollY);
  expect(desktopAfter.drawer).toEqual(desktopBefore.drawer);
  expect(desktopAfter.scrollY).toBe(desktopBefore.scrollY);
});
