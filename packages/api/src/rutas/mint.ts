import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance, RawServerDefault } from "fastify";
import { z } from "zod";
import type { registro } from "../comun/registro.js";
import { acunarToken, secretoValido } from "../agente/sesion.js";

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
    peticion.log.info({ usuarioId }, "token acuñado");

    return respuesta.send({ token: acunarToken(usuarioId) });
  });
}
