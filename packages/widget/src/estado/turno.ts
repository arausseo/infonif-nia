import type { EventoServidor, Paso, Turno } from "../tipos.js";

/**
 * Reducer del turno sobre el stream SSE (CONTRATOS §6).
 *
 * Puro y sin reloj propio: el instante llega como parámetro. Así se puede probar
 * la línea de tiempo entera sin esperar a nada.
 */

export function turnoVacio(id: string, pregunta?: string): Turno {
  const turno: Turno = { id, texto: "", pasos: [], tarjetas: [], enCurso: true };
  if (pregunta !== undefined) turno.pregunta = pregunta;
  return turno;
}

export function aplicar(turno: Turno, evento: EventoServidor, ahora: number): Turno {
  switch (evento.evento) {
    case "inicio":
      return turno;

    case "status": {
      const { id, texto, estado, detalle } = evento.datos;
      const existente = turno.pasos.find((p) => p.id === id);

      // Un status con id nuevo crea paso; con id conocido, lo actualiza en sitio.
      if (!existente) {
        const paso: Paso = { id, texto: texto ?? "", estado, desde: ahora };
        if (detalle !== undefined) paso.detalle = detalle;
        return { ...turno, pasos: [...turno.pasos, paso] };
      }

      return {
        ...turno,
        pasos: turno.pasos.map((paso) =>
          paso.id === id
            ? {
                ...paso,
                // Un status de cierre no trae texto: se conserva el que había.
                texto: texto ?? paso.texto,
                estado,
                ...(detalle !== undefined ? { detalle } : {}),
              }
            : paso,
        ),
      };
    }

    case "texto":
      return { ...turno, texto: turno.texto + evento.datos.delta };

    case "tarjeta": {
      const nueva = evento.datos;
      // Una tarjeta con clave conocida sustituye a la anterior en su sitio:
      // cotizar un segmento no añade una segunda tarjeta, actualiza la que hay.
      const previa = nueva.clave
        ? turno.tarjetas.findIndex((t) => t.clave === nueva.clave)
        : -1;

      if (previa === -1) return { ...turno, tarjetas: [...turno.tarjetas, nueva] };

      const tarjetas = [...turno.tarjetas];
      tarjetas[previa] = nueva;
      return { ...turno, tarjetas };
    }

    case "fin":
      return { ...turno, enCurso: false, duracion: ahora - inicioDe(turno, ahora) };

    case "error":
      return {
        ...turno,
        enCurso: false,
        error: evento.datos.mensaje,
        // El paso que estuviera en curso se marca en error: así la línea de
        // tiempo se abre justo donde se rompió.
        pasos: turno.pasos.map((paso) =>
          paso.estado === "activo" ? { ...paso, estado: "error" as const } : paso,
        ),
      };
  }
}

function inicioDe(turno: Turno, ahora: number): number {
  return turno.pasos[0]?.desde ?? ahora;
}

// ─── Ayudas para la vista ─────────────────────────────────────────────────────

/**
 * Tiempo mínimo que un paso permanece visible antes de darse por cerrado.
 *
 * Sin esto, un paso que resuelve en 80 ms parpadea y se lee como un fallo. No es
 * falsear el progreso: el trabajo ocurrió, solo se evita el parpadeo
 * (CONTRATOS §6).
 */
export const MINIMO_VISIBLE_MS = 350;

/** Cuánto hay que esperar para poder mostrar el cierre de un paso. */
export function esperaHastaCierre(desde: number, ahora: number): number {
  return Math.max(0, MINIMO_VISIBLE_MS - (ahora - desde));
}

export type EstadoLineaDeTiempo = "durante" | "hecho" | "error";

export function estadoDeLaLinea(turno: Turno): EstadoLineaDeTiempo {
  if (turno.pasos.some((p) => p.estado === "error") || turno.error) return "error";
  return turno.enCurso ? "durante" : "hecho";
}

/** «3 pasos · 1,2 s», que es como se resume la línea al colapsarse. */
export function resumenDeLaLinea(turno: Turno): string {
  const pasos = turno.pasos.length;
  const plural = pasos === 1 ? "paso" : "pasos";
  if (turno.duracion === undefined) return `${pasos} ${plural}`;
  const segundos = (turno.duracion / 1000).toLocaleString("es-ES", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${pasos} ${plural} · ${segundos} s`;
}
