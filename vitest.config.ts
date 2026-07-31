import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    // functions/ has its own config; tests/rules needs the Firestore emulator
    // (see vitest.rules.config.mts and `npm run test:rules`).
    exclude: [...configDefaults.exclude, "functions/**", "tests/rules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
