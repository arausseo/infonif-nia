import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/*.json",
      "packages/semantica/artefactos/**",
      "**/dist-biblioteca/**",
      // design-sync: scripts montados y salida regenerable. No es código nuestro.
      ".ds-sync/**",
      "ds-bundle/**",
      ".design-sync/.cache/**",
      ".design-sync/overrides/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Regla no negociable de CLAUDE.md: TypeScript estricto, sin `any`.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Nunca `throw` de strings: los errores son tipos propios de comun/errores.ts
      "no-throw-literal": "error",
    },
  },
);
