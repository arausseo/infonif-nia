import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Cargar el modelo local la primera vez descarga ~120 MB.
    testTimeout: 120_000,
  },
});
