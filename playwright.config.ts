import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  // The simulator is server-gated off in this production-built suite.
  testIgnore: ['booth-simulator.spec.ts', 'admin-booth-simulator.spec.ts', 'booth-instax.spec.ts'],
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:1437', headless: true },
  webServer: {
    command: 'node tests/fixtures/browser-server.mjs',
    url: 'http://127.0.0.1:1437/sign-in',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
