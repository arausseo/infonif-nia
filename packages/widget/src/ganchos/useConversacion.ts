import { useCallback, useRef, useState } from "react";
import { conversar } from "../sse/cliente.js";
import { aplicar, esperaHastaCierre, turnoVacio } from "../estado/turno.js";
import { configuracionActual } from "../montar.js";
import type { ConfiguracionEmbebida, EventoServidor, Turno } from "../tipos.js";

const CLAVE_CONVERSACION = "nia:conversationId";

/**
 * El estado de la conversación y el envío de turnos.
 *
 * Dos cosas que no son obvias:
 *
 * 1. **El mínimo visible de 350 ms se aplica aquí**, no en el reducer. Cuando un
 *    paso se cierra antes de tiempo, el cierre se retrasa lo que falte. El
 *    reducer sigue siendo puro y el retraso es solo de presentación.
 * 2. **El `conversationId` vive en `sessionStorage`**, no el historial. El sitio
 *    es multipágina y cada clic remonta el widget; el historial se rehidrata
 *    desde Redis al enviar el siguiente turno (CLAUDE.md).
 */
export function useConversacion(configuracion: ConfiguracionEmbebida) {
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [enviando, setEnviando] = useState(false);
  const conversacion = useRef<string | undefined>(leerConversacion());
  const aborto = useRef<AbortController | undefined>(undefined);
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);
  /** Cuándo apareció cada paso, para el mínimo visible de 350 ms. */
  const aparicion = useRef<Map<string, number>>(new Map());

  const apiBase = configuracion.apiBase ?? origenDelScript();

  const enviar = useCallback(
    async (mensaje: string) => {
      const texto = mensaje.trim();
      if (texto.length === 0 || enviando) return;

      setEnviando(true);
      const idTurno = `t${Date.now()}`;
      setTurnos((previos) => [...previos, turnoVacio(idTurno, texto)]);

      const actualizar = (evento: EventoServidor) => {
        setTurnos((previos) =>
          previos.map((turno) =>
            turno.id === idTurno ? aplicar(turno, evento, Date.now()) : turno,
          ),
        );
      };

      aborto.current = new AbortController();

      await conversar({
        apiBase,
        mensaje: texto,
        ...(conversacion.current ? { conversationId: conversacion.current } : {}),
        ...(configuracion.contexto ? { contexto: configuracion.contexto } : {}),
        // El token se relee ahora, no el que hubiera al montar: dura 15 min y
        // la página puede haberlo renovado.
        ...(configuracionActual().token
          ? { token: configuracionActual().token as string }
          : {}),
        senal: aborto.current.signal,
        alEvento(evento) {
          if (evento.evento === "inicio") {
            conversacion.current = evento.datos.conversationId;
            guardarConversacion(evento.datos.conversationId);
            return;
          }

          if (evento.evento === "status") {
            const { id, estado } = evento.datos;

            if (estado === "activo") {
              // Se apunta cuándo apareció por primera vez, no en cada subpaso:
              // los subpasos actualizan el mismo paso y no reinician su reloj.
              if (!aparicion.current.has(id)) aparicion.current.set(id, Date.now());
            } else {
              // El cierre se retrasa si el paso no ha estado visible lo bastante.
              const desde = aparicion.current.get(id) ?? Date.now();
              const espera = esperaHastaCierre(desde, Date.now());
              if (espera > 0) {
                temporizadores.current.push(setTimeout(() => actualizar(evento), espera));
                return;
              }
            }
          }

          actualizar(evento);
        },
      });

      setEnviando(false);
    },
    [apiBase, configuracion.contexto, enviando],
  );

  const cancelar = useCallback(() => {
    aborto.current?.abort();
    aparicion.current.clear();
    for (const t of temporizadores.current) clearTimeout(t);
    temporizadores.current = [];
    setEnviando(false);
  }, []);

  const reiniciar = useCallback(() => {
    cancelar();
    conversacion.current = undefined;
    try {
      sessionStorage.removeItem(CLAVE_CONVERSACION);
    } catch {
      // Sin sessionStorage se pierde la conversación al navegar. Se puede vivir.
    }
    setTurnos([]);
  }, [cancelar]);

  return { turnos, enviar, enviando, cancelar, reiniciar };
}

function leerConversacion(): string | undefined {
  try {
    return sessionStorage.getItem(CLAVE_CONVERSACION) ?? undefined;
  } catch {
    return undefined;
  }
}

function guardarConversacion(id: string): void {
  try {
    sessionStorage.setItem(CLAVE_CONVERSACION, id);
  } catch {
    // Modo privado de algunos navegadores. No es motivo para no funcionar.
  }
}

/** El API vive en el mismo origen que el script embebido, salvo que digan otra cosa. */
function origenDelScript(): string {
  const actual = document.currentScript as HTMLScriptElement | null;
  if (actual?.src) {
    try {
      return new URL(actual.src).origin;
    } catch {
      // cae al origen de la página
    }
  }
  return window.location.origin;
}
