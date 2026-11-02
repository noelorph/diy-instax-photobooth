import { defineConfig, globalIgnores } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Agent scratch copies and the generated vendor qualification bundle.
    '.superpowers/**',
    'docs/qualification/multipart-isolated/instrumentation/patched-handler.js',
  ]),
  {
    files: ['docs/qualification/multipart-isolated/instrumentation/qualification-hook.cjs'],
    // This hook is loaded by require() inside the immutable CommonJS test image.
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettierConfig,
]);

export default eslintConfig;
