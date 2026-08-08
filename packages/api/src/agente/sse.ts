import type { FastifyReply } from "fastify";
import type { EventoSSE } from "./tipos.js";

/**
 * Emisor de Server-Sent Events (CONTRATOS §1).
 *
 * Cuidado con el despliegue: **nginx rompe el SSE por defecto**. El síntoma
 * engaña, porque todo llega junto al final en lugar de fallar. Hace falta
 * `proxy_buffering off` y la cabecera `X-Accel-Buffering: no`, que va también
 * aquí por si delante hay algo que la respete.
 */
export function abrirSSE(respuesta: FastifyReply): (evento: EventoSSE) => void {
  respuesta.raw.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  // Un comentario inicial fuerza a los proxys a soltar las cabeceras ya.
  respuesta.raw.write(": nia\n\n");

  let cerrado = false;
  respuesta.raw.on("close", () => {
    cerrado = true;
  });

  return (evento: EventoSSE) => {
    if (cerrado || respuesta.raw.writableEnded) return;
    respuesta.raw.write(
      `event: ${evento.evento}\ndata: ${JSON.stringify(evento.datos)}\n\n`,
    );
  };
}

export function cerrarSSE(respuesta: FastifyReply): void {
  if (!respuesta.raw.writableEnded) respuesta.raw.end();
}
