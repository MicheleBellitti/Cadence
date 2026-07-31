import { defineConfig } from "vitest/config";

/**
 * Firestore security-rules tests. Separate from the main config because they
 * need the emulator and a node environment — run them with `npm run test:rules`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
