import type { IncomingMessage, ServerResponse } from "node:http";
import type { FastifyInstance, RawServerDefault } from "fastify";
import { z } from "zod";
import { describirError } from "../comun/errores.js";
import { registro } from "../comun/registro.js";

/**
 * El servidor lleva nuestro logger de pino, no el de serie, y el genérico de
 * Fastify es invariante en ese parámetro. Sin fijarlo aquí no encaja.
 */
type Servidor = FastifyInstance<
  RawServerDefault,
  IncomingMessage,
  ServerResponse,
  typeof registro
>;
import { resolverDerechos } from "../datos/derechos.js";
import { ejecutarTurno } from "../agente/bucle.js";
import {
  guardarHistorial,
  leerHistorial,
  nuevoIdConversacion,
  nuevoIdTurno,
} from "../agente/conversacion.js";
import { abrirSSE, cerrarSSE } from "../agente/sse.js";
import { validarToken } from "../agente/sesion.js";
import { trazar } from "../agente/trazas.js";
import type { ContextoPagina } from "../agente/tipos.js";

/**
 * `POST /v1/conversar` → `text/event-stream` (CONTRATOS §1).
 */

const ContextoPaginaEsquema = z
  .object({
    tipo: z.enum(["ficha", "busqueda", "listado", "portada", "ranking"]),
    nif: z.string().optional(),
    razonSocial: z.string().optional(),
    termino: z.string().optional(),
  })
  .strict();

const Peticion = z
  .object({
    conversationId: z.string().optional(),
    mensaje: z.string().min(1).max(4000),
    contexto: ContextoPaginaEsquema.optional(),
    // Sin `usuarioId`: quién es el usuario lo dice el token firmado que acuñó el
    // ASP en `/internal/mint`, no el cuerpo. Y `.strict()` rechaza el intento.
  })
  .strict();

export function registrarConversar(app: Servidor): void {
  app.post("/v1/conversar", async (peticion, respuesta) => {
    const validado = Peticion.safeParse(peticion.body);
    if (!validado.success) {
      return respuesta.status(400).send({
        codigo: "VALIDACION",
        mensaje: validado.error.issues.map((i) => i.message).join("; "),
      });
    }

    const { mensaje, contexto } = validado.data;

    // Quién es el usuario lo dice el token que acuñó el ASP, nunca el cuerpo.
    const cabecera = peticion.headers.authorization;
    const sesion = validarToken(cabecera?.replace(/^Bearer /i, ""));
    const usuarioId = sesion?.usuarioId;
    const conversationId = validado.data.conversationId ?? nuevoIdConversacion();
    const turnoId = nuevoIdTurno();

    const emitir = abrirSSE(respuesta);
    const arranque = performance.now();

    // Si el usuario cierra la pestaña, se corta el turno en lugar de seguir
    // gastando tokens contra un socket muerto.
    //
    // Se escucha en la RESPUESTA, no en la petición: `peticion.raw` emite
    // «close» en cuanto termina de leerse el cuerpo, que es siempre y de
    // inmediato. Escuchar ahí aborta el turno antes de empezar.
    const control = new AbortController();
    respuesta.raw.on("close", () => {
      if (!respuesta.raw.writableFinished) control.abort();
    });

    emitir({ evento: "inicio", datos: { conversationId, turnoId } });

    try {
      const [derechos, historial] = await Promise.all([
        resolverDerechos(usuarioId),
        leerHistorial(conversationId),
      ]);

      const resultado = await ejecutarTurno({
        mensaje,
        historial,
        derechos,
        ...(contexto ? { contextoPagina: contexto as ContextoPagina } : {}),
        senal: control.signal,
        emitir,
      });

      await guardarHistorial(conversationId, resultado.mensajes);

      emitir({
        evento: "fin",
        datos: { stopReason: resultado.stopReason, tokens: resultado.tokens },
      });

      trazar({
        conversationId,
        turnoId,
        perfil: derechos.perfil,
        herramientas: resultado.herramientas,
        tokens: resultado.tokens,
        stopReason: resultado.stopReason,
        msTotal: Math.round(performance.now() - arranque),
      });
    } catch (error) {
      registro.error({ err: describirError(error), turnoId }, "el turno falló");
      emitir({
        evento: "error",
        datos: {
          codigo: "HERRAMIENTA_FALLO",
          mensaje: "No he podido completar la respuesta. Inténtalo otra vez.",
        },
      });
    } finally {
      cerrarSSE(respuesta);
    }

    return respuesta;
  });
}
