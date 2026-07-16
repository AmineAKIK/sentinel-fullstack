import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  preview: {
    port: 5173,
    host: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: [
        'src/api/client.ts',
        'src/hooks/useIncidentsData.ts',
        'src/components/ConfirmModal.tsx',
        'src/components/IncidentBadges.tsx',
        'src/components/IncidentCard.tsx',
        'src/components/IncidentMetricsBar.tsx',
        'src/components/Modal.tsx',
        'src/components/ReviewIncidentRequestModal.tsx',
        'src/components/SupportChat.tsx',
        'src/utils/**/*.{ts,tsx}',
      ],
      exclude: ['src/**/__tests__/**'],
      thresholds: {
        statements: 85,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
});
