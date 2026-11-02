import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'admin-booth-simulator.spec.ts',
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:1439',
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: {
    command: 'node tests/fixtures/admin-booth-server.mjs 1439',
    url: 'http://127.0.0.1:1439/sign-in',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
