import type { ContextoPagina, EventoServidor } from "../tipos.js";

/**
 * Cliente SSE sobre `fetch`.
 *
 * No se usa `EventSource` porque solo sabe hacer GET y aquí hace falta POST con
 * cuerpo y con cabecera de autorización.
 *
 * El parser va por bloques separados por línea en blanco. Un `data:` puede
 * llegar partido entre dos trozos del stream, así que lo que sobra se guarda
 * hasta el siguiente.
 */

export interface OpcionesConversar {
  apiBase: string;
  mensaje: string;
  conversationId?: string;
  contexto?: ContextoPagina;
  token?: string;
  senal?: AbortSignal;
  alEvento(evento: EventoServidor): void;
}

export async function conversar(opciones: OpcionesConversar): Promise<void> {
  const cabeceras: Record<string, string> = { "content-type": "application/json" };
  if (opciones.token) cabeceras["authorization"] = `Bearer ${opciones.token}`;

  const cuerpo: Record<string, unknown> = { mensaje: opciones.mensaje };
  if (opciones.conversationId) cuerpo["conversationId"] = opciones.conversationId;
  if (opciones.contexto) cuerpo["contexto"] = opciones.contexto;

  const peticion: RequestInit = {
    method: "POST",
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  };
  if (opciones.senal) peticion.signal = opciones.senal;

  const respuesta = await fetch(`${opciones.apiBase}/v1/conversar`, peticion);

  if (!respuesta.ok || !respuesta.body) {
    opciones.alEvento({
      evento: "error",
      datos: {
        codigo: "RED",
        mensaje: `El servicio ha respondido ${respuesta.status}. Inténtalo otra vez.`,
      },
    });
    return;
  }

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let resto = "";

  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;

      resto += decodificador.decode(value, { stream: true });
      const bloques = resto.split("\n\n");
      resto = bloques.pop() ?? "";

      for (const bloque of bloques) {
        const evento = interpretar(bloque);
        if (evento) opciones.alEvento(evento);
      }
    }
  } catch (error) {
    // Abortar es una decisión nuestra, no un fallo que contarle al usuario.
    if (error instanceof Error && error.name === "AbortError") return;
    opciones.alEvento({
      evento: "error",
      datos: { codigo: "RED", mensaje: "Se ha cortado la conexión." },
    });
  }
}

export function interpretar(bloque: string): EventoServidor | undefined {
  let nombre: string | undefined;
  const partes: string[] = [];

  for (const linea of bloque.split("\n")) {
    // Los comentarios (`: algo`) mantienen viva la conexión y se ignoran.
    if (linea.startsWith(":")) continue;
    if (linea.startsWith("event:")) nombre = linea.slice(6).trim();
    else if (linea.startsWith("data:")) partes.push(linea.slice(5).trim());
  }

  if (!nombre || partes.length === 0) return undefined;

  try {
    const datos = JSON.parse(partes.join("\n")) as never;
    return { evento: nombre, datos } as EventoServidor;
  } catch {
    return undefined;
  }
}
