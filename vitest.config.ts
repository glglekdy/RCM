import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/editor/test/**/*.test.ts', 'apps/web/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
  },
});
