import { defineConfig } from "tsup";

/**
 * Este paquete se compila, no se consume en crudo.
 *
 * Exportaba `src/index.ts` directamente, lo cual funciona en desarrollo porque
 * `tsx` transpila al vuelo, pero en el servidor Node se encontraba TypeScript sin
 * compilar y moría con ERR_MODULE_NOT_FOUND buscando `corpus.js`.
 *
 * La salida va a `dist/`, un nivel por debajo de la raíz del paquete, igual que
 * `src/`. Eso importa: `vectores.ts` localiza los artefactos con
 * `resolve(dirname(import.meta.url), "../artefactos")`, así que desde `dist/`
 * apunta al mismo sitio que desde `src/`. Por eso este paquete se compila aparte
 * en vez de empaquetarse dentro del API: desde `packages/api/dist/` esa ruta
 * relativa apuntaría a `packages/api/artefactos`, que no existe.
 */
export default defineConfig((opciones) => ({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  sourcemap: true,

  /**
   * En `--watch` NO se limpia, y esto importa más de lo que parece.
   *
   * `pnpm dev` arranca todos los paquetes a la vez. Si aquí se borra `dist/`
   * al empezar, hay una ventana —corta, pero real— en la que el API ya está
   * levantando y `@nia/semantica` no existe: ERR_MODULE_NOT_FOUND al importar.
   * Gana quien arranque antes, que es la peor clase de fallo: intermitente y
   * dependiente de lo rápida que sea la máquina.
   */
  clean: !opciones.watch,
  // El runtime de ONNX es dependencia opcional del API y se carga con un import
  // dinámico. Empaquetarlo aquí lo volvería obligatorio.
  external: ["@huggingface/transformers"],
}));
