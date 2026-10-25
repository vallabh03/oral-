import { defineConfig } from "vitest/config";
import path from "node:path";

const __dirname = import.meta.dirname;

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/empty.ts") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts", "tests/security/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
  },
});
