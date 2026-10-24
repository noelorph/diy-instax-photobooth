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
    command: 'npm run dev -- --hostname 127.0.0.1 --port 1438',
    env: { BOOTH_SIMULATOR_ENABLED: 'true', NEXT_TELEMETRY_DISABLED: '1' },
    url: 'http://127.0.0.1:1438/booth',
    timeout: 120000,
    reuseExistingServer: false,
  },
});
