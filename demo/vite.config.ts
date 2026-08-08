import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const API = "http://localhost:3000";

/**
 * Imita la parte servidor del puente de sesión (CONTRATOS §5).
 *
 * En el portal real es el ASP quien llama a `POST /internal/mint` con el secreto
 * compartido y le inyecta el token a la página. Aquí lo hace este middleware,
 * porque **el secreto no puede pisar el navegador jamás**: quien lo tenga puede
 * acuñar un token para cualquier usuario.
 */
function puenteDeSesion(): Plugin {
  return {
    name: "nia-puente-de-sesion",
    configureServer(servidor) {
      servidor.middlewares.use("/api-demo/mint", (peticion, respuesta) => {
        let cuerpo = "";
        peticion.on("data", (trozo) => (cuerpo += trozo));
        peticion.on("end", () => {
          void (async () => {
            try {
              const acunado = await fetch(`${API}/internal/mint`, {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-shared-secret": process.env["AGENT_SHARED_SECRET"] ?? "",
                },
                body: cuerpo,
              });
              respuesta.statusCode = acunado.status;
              respuesta.setHeader("content-type", "application/json");
              respuesta.end(await acunado.text());
            } catch (error) {
              respuesta.statusCode = 502;
              respuesta.end(JSON.stringify({ error: String(error) }));
            }
          })();
        });
      });
    },
  };
}

/**
 * La demo carga el widget DESDE EL CÓDIGO FUENTE para tener recarga en caliente
 * mientras se desarrolla. En producción el ASP embebe el bundle único:
 *
 *   <script src="https://nia.infonif.es/widget.js" async></script>
 *
 * que produce `pnpm --filter @nia/widget build`.
 */
export default defineConfig({
  plugins: [react(), puenteDeSesion()],
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
