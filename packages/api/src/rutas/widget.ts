import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance, RawServerDefault } from "fastify";
import estaticos from "@fastify/static";
import type { registro } from "../comun/registro.js";

type Servidor = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  typeof registro
>;

/**
 * Sirve el bundle del widget desde el propio API.
 *
 * Podría servirlo el IIS, pero entonces la versión del widget y la del API se
 * desacoplan: alguien despliega el API y el navegador sigue con un widget de
 * hace tres semanas hablando un protocolo que ya cambió. Sirviéndolo aquí, un
 * despliegue mueve las dos cosas a la vez.
 *
 * `<script src>` no está sujeto a CORS, así que el ASP puede apuntar aquí desde
 * otro origen sin más. Lo que sí necesita CORS es `/v1/conversar`, y eso ya
 * está resuelto en el servidor.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));

/** dist/rutas/ → packages/api/ → packages/widget/dist */
const CANDIDATOS = [
  resolve(AQUI, "../../../widget/dist"),
  resolve(AQUI, "../../../../widget/dist"),
];

export function registrarWidget(app: Servidor): void {
  const raiz = CANDIDATOS.find((c) => existsSync(resolve(c, "widget.js")));

  if (!raiz) {
    // No es fatal: el API sirve para algo sin el widget, y en desarrollo el
    // widget lo sirve Vite. Pero en producción esto significa que la página
    // va a pedir un `widget.js` que no existe, así que se avisa fuerte.
    app.log.error(
      { buscado: CANDIDATOS },
      "no se encuentra widget.js — el <script> del portal dará 404",
    );
    return;
  }

  void app.register(estaticos, {
    root: raiz,
    prefix: "/",
    // Solo el bundle y su mapa. `root` es un directorio de build y no queremos
    // publicar lo que aparezca ahí el día de mañana.
    allowedPath: (ruta) => ruta === "/widget.js" || ruta === "/widget.js.map",
    // El widget cambia con cada despliegue y lo pide cada página del portal.
    // Un minuto: suficiente para no machacar, poco para no quedarse pegado.
    maxAge: 60_000,
  });

  app.log.info({ raiz }, "widget.js servido");
}
