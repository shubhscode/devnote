import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'pnpm dev --port 5173',
    url: 'http://localhost:5173/',
    reuseExistingServer: !process.env.CI,
  },
});
