import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration Playwright (tests end-to-end).
 *
 * Les deux serveurs (backend :3000, frontend Vite :5173) sont démarrés au besoin
 * mais RÉUTILISÉS s'ils tournent déjà (`reuseExistingServer`) — pratique en dev,
 * où ils sont souvent lancés à la main, et évite les conflits de port.
 *
 * Pré-requis : la base doit contenir le jeu E2E. Le script `test:e2e` exécute
 * `seed:e2e` (backend) juste avant cette suite.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm --prefix ../backend run dev',
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
