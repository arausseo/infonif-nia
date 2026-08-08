import { config } from "../comun/config.js";
import { registro } from "../comun/registro.js";
import type { Derechos } from "../datos/derechos.js";

/**
 * Trazas a Langfuse.
 *
 * **Lo que NO se traza es tan importante como lo que sí.** El criterio de
 * aceptación de la Fase 3 dice literalmente que el dato de pago no puede
 * aparecer en la traza. Aquí solo entran metadatos: qué herramientas se usaron,
 * cuánto tardaron, cuántos tokens costó y el perfil del usuario.
 *
 * No entran ni el texto del usuario, ni la respuesta del modelo, ni los
 * resultados de las herramientas. Si algún día hiciera falta trazar contenido,
 * habría que hablarlo antes: sería sacar datos mercantiles de terceros a un
 * sistema de observabilidad.
 */

export interface TrazaTurno {
  conversationId: string;
  turnoId: string;
  perfil: Derechos["perfil"];
  herramientas: { nombre: string; ms: number; ok: boolean }[];
  tokens: { entrada: number; salida: number };
  stopReason: string;
  msTotal: number;
}

const activo = Boolean(
  config.LANGFUSE_BASE_URL && config.LANGFUSE_PUBLIC_KEY && config.LANGFUSE_SECRET_KEY,
);

export function trazasActivas(): boolean {
  return activo;
}

/** Nunca lanza ni bloquea el turno: una traza perdida no vale una respuesta perdida. */
export function trazar(traza: TrazaTurno): void {
  registro.info(
    {
      conversationId: traza.conversationId,
      turnoId: traza.turnoId,
      perfil: traza.perfil,
      herramientas: traza.herramientas.map((h) => h.nombre),
      tokens: traza.tokens,
      stopReason: traza.stopReason,
      ms: traza.msTotal,
    },
    "turno",
  );

  if (!activo) return;

  void enviar(traza).catch((error: unknown) => {
    registro.debug({ err: String(error) }, "no se pudo enviar la traza");
  });
}

async function enviar(traza: TrazaTurno): Promise<void> {
  const credenciales = Buffer.from(
    `${config.LANGFUSE_PUBLIC_KEY}:${config.LANGFUSE_SECRET_KEY}`,
  ).toString("base64");

  await fetch(`${config.LANGFUSE_BASE_URL}/api/public/ingestion`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${credenciales}`,
    },
    body: JSON.stringify({
      batch: [
        {
          id: `${traza.turnoId}-trace`,
          type: "trace-create",
          timestamp: new Date().toISOString(),
          body: {
            id: traza.turnoId,
            name: "turno",
            sessionId: traza.conversationId,
            // Sin `input` ni `output` a propósito.
            metadata: {
              perfil: traza.perfil,
              herramientas: traza.herramientas,
              stopReason: traza.stopReason,
              msTotal: traza.msTotal,
              tokens: traza.tokens,
            },
          },
        },
      ],
    }),
    signal: AbortSignal.timeout(5000),
  });
}
