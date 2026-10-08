import { defineConfig } from 'vitest/config';

/** Reports that aren't pass/fail tests (`npm run sim`). */
export default defineConfig({
  test: { include: ['scripts/**/*.test.ts'], testTimeout: 1800000 },
});
