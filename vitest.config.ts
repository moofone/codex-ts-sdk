import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  cacheDir: './.vitest',
  resolve: {
    alias: {
      'codex-ts-sdk': path.resolve(__dirname, 'src/index.ts'),
    },
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
