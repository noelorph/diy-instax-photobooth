import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Integration files share the isolated local Auth/database stack. Some
    // assert complete Draft lists, so another file must not mutate those rows.
    fileParallelism: false,
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
