import { config } from "../../comun/config.js";
import { ErrorElastic } from "../../comun/errores.js";

/**
 * Envoltorio propio sobre `fetch`.
 *
 * NO usar `@elastic/elasticsearch`: desde 7.14 hace una verificación de producto
 * y rechaza clústeres OSS como el de Infonif (ADR-003).
 */

const TIEMPO_LIMITE_MS = 15_000;

type Metodo = "GET" | "POST" | "PUT" | "DELETE" | "HEAD";

interface OpcionesEs {
  metodo?: Metodo;
  cuerpo?: object;
  /** Cuerpo ya serializado en NDJSON (bulk). */
  ndjson?: string;
  tiempoLimiteMs?: number;
}

export async function es<T = unknown>(
  ruta: string,
  opciones: OpcionesEs = {},
): Promise<T> {
  const { cuerpo, ndjson, tiempoLimiteMs = TIEMPO_LIMITE_MS } = opciones;
  const metodo: Metodo = opciones.metodo ?? (cuerpo || ndjson ? "POST" : "GET");

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempoLimiteMs);

  try {
    const respuesta = await fetch(`${config.ES_URL}${ruta}`, {
      method: metodo,
      headers: {
        "content-type": ndjson ? "application/x-ndjson" : "application/json",
      },
      body: ndjson ?? (cuerpo ? JSON.stringify(cuerpo) : undefined),
      signal: control.signal,
    });

    if (!respuesta.ok) {
      throw new ErrorElastic(respuesta.status, await respuesta.text());
    }

    // HEAD y algunas respuestas no traen cuerpo.
    const texto = await respuesta.text();
    return (texto ? JSON.parse(texto) : undefined) as T;
  } catch (error) {
    if (error instanceof ErrorElastic) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ErrorElastic(504, `Elasticsearch no respondió en ${tiempoLimiteMs} ms`);
    }
    throw new ErrorElastic(0, `No se pudo contactar con Elasticsearch: ${String(error)}`);
  } finally {
    clearTimeout(temporizador);
  }
}

/** `true` si el recurso existe. Usa HEAD, que no lanza en 404. */
export async function existe(ruta: string): Promise<boolean> {
  try {
    const respuesta = await fetch(`${config.ES_URL}${ruta}`, { method: "HEAD" });
    return respuesta.ok;
  } catch {
    return false;
  }
}

export interface EstadoElastic {
  disponible: boolean;
  version?: string;
  distribucion?: string;
  detalle?: string;
}

/** Para /salud/dependencias. Nunca lanza. */
export async function estadoElastic(): Promise<EstadoElastic> {
  try {
    const raiz = await es<{ version?: { number?: string; build_flavor?: string } }>("/", {
      tiempoLimiteMs: 3000,
    });
    return {
      disponible: true,
      version: raiz.version?.number,
      distribucion: raiz.version?.build_flavor,
    };
  } catch (error) {
    return { disponible: false, detalle: String(error) };
  }
}
