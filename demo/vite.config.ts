import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * La demo carga el widget DESDE EL CÓDIGO FUENTE para tener recarga en caliente
 * mientras se desarrolla. En producción el ASP embebe el bundle único:
 *
 *   <script src="https://nia.infonif.es/widget.js" async></script>
 *
 * que produce `pnpm --filter @nia/widget build`.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@nia/widget": fileURLToPath(
        new URL("../packages/widget/src/montar.tsx", import.meta.url),
      ),
    },
    // El widget se sirve desde fuera de la raíz de la demo, así que sus imports
    // bare (`react`) se resuelven contra esta raíz. Sin `dedupe` acabaríamos con
    // dos copias de React y los hooks reventarían.
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: { exclude: ["@nia/widget"] },
  server: { port: 5174, strictPort: true },
});
