import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/servidor.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,
  clean: true,
  // Los fixtures se leen en runtime desde disco, no se empaquetan.
  external: ["mssql", "ioredis"],
});
