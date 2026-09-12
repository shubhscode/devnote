import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Playwright e2e lives in apps/web/e2e (run via pnpm e2e), benches via pnpm bench.
    exclude: ['**/e2e/**', '**/node_modules/**', '**/dist/**'],
  },
});
