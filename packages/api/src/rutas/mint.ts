import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance, RawServerDefault } from "fastify";
import { z } from "zod";
import type { registro } from "../comun/registro.js";
import { acunarToken, secretoValido } from "../agente/sesion.js";
import { guardarClaveUsuario } from "../datos/icif/claves.js";

type Servidor = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  typeof registro
>;

/**
 * `POST /internal/mint` (CONTRATOS §5).
 *
 * **Este endpoint no debe ser alcanzable desde internet.** Solo desde la red del
 * IIS. El secreto compartido es la última línea, no la única: quien pueda
 * llamarlo con el secreto puede acuñar un token para cualquier usuario.
 *
 * En nginx:
 *
 *     location /internal/ {
 *         allow 10.0.0.0/8;
 *         deny all;
 *         proxy_pass http://127.0.0.1:3000;
 *     }
 */

const Peticion = z
  .object({
    usuarioId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
    /** El ASP lo manda, pero el plan real se resuelve contra su API. */
    plan: z.string().optional(),
    /**
     * `ICIF-APIKEY` del usuario, para el gateway de datos de empresa.
     *
     * Llega por aquí y no por el navegador porque este endpoint es servidor a
     * servidor: el ASP ya la tiene en su sesión y nunca sale del centro de
     * datos. Se guarda en Redis, **no dentro del token** — la carga del token va
     * firmada pero no cifrada, y esta clave gasta créditos de quien la posee.
     */
    apiKey: z.string().min(8).optional(),
  })
  .strict();

export function registrarMint(app: Servidor): void {
  app.post("/internal/mint", async (peticion, respuesta) => {
    if (!secretoValido(peticion.headers["x-shared-secret"] as string | undefined)) {
      // Sin detalles: al que prueba secretos no se le dice si va bien encaminado.
      return respuesta.status(403).send({ codigo: "PROHIBIDO" });
    }

    const validado = Peticion.safeParse(peticion.body);
    if (!validado.success) {
      return respuesta.status(400).send({ codigo: "VALIDACION" });
    }

    const usuarioId = Number(validado.data.usuarioId);
    const { apiKey } = validado.data;

    if (apiKey) await guardarClaveUsuario(usuarioId, apiKey);

    // Se registra SI venía clave, nunca la clave. Un secreto en el log es un
    // secreto filtrado: los logs se copian, se comparten y se archivan.
    peticion.log.info({ usuarioId, conClaveIcif: Boolean(apiKey) }, "token acuñado");

    return respuesta.send({ token: acunarToken(usuarioId) });
  });
}
