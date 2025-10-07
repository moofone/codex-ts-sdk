import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: './.vitest',
  resolve: {
    alias: [
      // Ensure the subpath alias resolves before the root package alias
      { find: /^codex-ts-sdk\/cloud$/, replacement: path.resolve(__dirname, 'src/cloud/index.ts') },
      { find: /^codex-ts-sdk$/, replacement: path.resolve(__dirname, 'src/index.ts') },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    reporter: 'verbose',
    env: {
      CODEX_SKIP_VERSION_CHECK: '0',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/bindings/**',
        'src/plugins/**',
        'src/types/**',
        'native/**',
        'examples/**',
        'scripts/**',
      ],
      thresholds: {
        lines: 100,
        statements: 100,
        branches: 100,
        functions: 100,
      },
    },
  },
});
