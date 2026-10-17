import { defineConfig } from "vitest/config";

// Gerçek OKX Demo, Anthropic API ve Fuji'ye karşı çalışır. .env gerekir.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
