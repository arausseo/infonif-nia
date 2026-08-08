import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Un solo fichero: el ASP embebe `<script src=".../widget.js" async>`.
 *
 * React va dentro del bundle a propósito — el portal no tiene React y no vamos a
 * pedirle que lo cargue. El CSS NO se emite como asset: se importa con `?inline`
 * y se inyecta como <style> dentro del shadow root, porque una hoja externa
 * tampoco cruzaría el límite del Shadow DOM.
 */
export default defineConfig({
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    lib: {
      entry: "src/montar.tsx",
      name: "NiaWidget",
      formats: ["iife"],
      fileName: () => "widget.js",
    },
    cssCodeSplit: false,
    sourcemap: true,
    target: "es2019",
  },
});
