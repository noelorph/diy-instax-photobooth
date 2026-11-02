import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'booth-simulator.spec.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:1438',
    headless: true,
    permissions: ['camera'],
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {
    command: 'node tests/fixtures/admin-booth-server.mjs 1438',
    url: 'http://127.0.0.1:1438/booth',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
