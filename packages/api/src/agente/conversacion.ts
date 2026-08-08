import { randomUUID } from "node:crypto";
import type Anthropic from "@anthropic-ai/sdk";
import { registro } from "../comun/registro.js";
import { obtenerRedis } from "../datos/redis/cliente.js";

/**
 * Historial de conversación en Redis.
 *
 * En Redis y no en `sessionStorage` (CLAUDE.md): el sitio es multipágina y cada
 * clic remonta el widget. Lo único que guarda el navegador es el
 * `conversationId`.
 *
 * Se conserva una ventana de los últimos turnos, no todo: una conversación larga
 * acabaría costando más en tokens de lo que aporta, y el bloque de sistema ya
 * lleva las reglas.
 */

const PREFIJO = "nia:conversacion";
const TTL_SEGUNDOS = 8 * 3600;
/** Mensajes conservados. Cuenta cada turno de usuario y de asistente por separado. */
const VENTANA = 24;

export function nuevoIdConversacion(): string {
  return `cv_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

export function nuevoIdTurno(): string {
  return `t_${randomUUID().slice(0, 8)}`;
}

export async function leerHistorial(
  conversationId: string,
): Promise<Anthropic.MessageParam[]> {
  try {
    const crudo = await obtenerRedis().get(`${PREFIJO}:${conversationId}`);
    if (!crudo) return [];
    const historial = JSON.parse(crudo) as Anthropic.MessageParam[];
    return Array.isArray(historial) ? historial : [];
  } catch (error) {
    registro.warn({ err: String(error) }, "no se pudo leer el historial");
    return [];
  }
}

export async function guardarHistorial(
  conversationId: string,
  mensajes: Anthropic.MessageParam[],
): Promise<void> {
  // Se corta por el final, pero nunca dejando un `tool_result` huérfano: si el
  // primer mensaje conservado los contiene, la API rechaza la petición entera
  // por no encontrar su `tool_use`.
  const recortado = recortarSinRomperHerramientas(mensajes, VENTANA);

  try {
    await obtenerRedis().set(
      `${PREFIJO}:${conversationId}`,
      JSON.stringify(recortado),
      "EX",
      TTL_SEGUNDOS,
    );
  } catch (error) {
    registro.warn({ err: String(error) }, "no se pudo guardar el historial");
  }
}

export function recortarSinRomperHerramientas(
  mensajes: readonly Anthropic.MessageParam[],
  ventana: number,
): Anthropic.MessageParam[] {
  if (mensajes.length <= ventana) return [...mensajes];

  let desde = mensajes.length - ventana;

  // Retroceder mientras el primer mensaje sea una respuesta de herramienta.
  while (desde > 0 && contieneResultadoDeHerramienta(mensajes[desde])) desde--;

  return mensajes.slice(desde);
}

function contieneResultadoDeHerramienta(mensaje?: Anthropic.MessageParam): boolean {
  if (!mensaje || typeof mensaje.content === "string") return false;
  return mensaje.content.some((bloque) => bloque.type === "tool_result");
}

export async function olvidarConversacion(conversationId: string): Promise<void> {
  try {
    await obtenerRedis().del(`${PREFIJO}:${conversationId}`);
  } catch {
    // Da igual: caduca sola.
  }
}
