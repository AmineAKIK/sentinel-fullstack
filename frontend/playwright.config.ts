import { defineConfig, devices } from '@playwright/test';

/**
 * Configuration Playwright (tests end-to-end).
 *
 * Les deux serveurs utilisent des ports réservés à la suite afin de ne jamais
 * tester accidentellement une instance de développement ou une autre base.
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
    baseURL: 'http://127.0.0.1:5174',
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
      command: 'PORT=3100 CLIENT_ORIGIN=http://127.0.0.1:5174 npm --prefix ../backend run dev',
      url: 'http://127.0.0.1:3100/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'VITE_API_URL=http://127.0.0.1:3100 npm run dev -- --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
