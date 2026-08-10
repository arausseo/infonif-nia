import { config } from "../../comun/config.js";
import { ErrorInfonif } from "../../comun/errores.js";
import { registro } from "../../comun/registro.js";

/**
 * Cliente del API de Infonif (`docs/API-INFONIF.md`).
 *
 * Envoltorio propio sobre `fetch`, sin SDK: no hay Swagger ni cliente oficial,
 * y el contrato lo tenemos documentado nosotros.
 *
 * La `apikey` no es un secreto —viaja en el bundle público de su buscador— pero
 * sin ella el API responde 500, así que se envía siempre.
 */

type Metodo = "GET" | "POST";

interface Opciones {
  metodo?: Metodo;
  cuerpo?: object;
  /** Por defecto `INFONIF_TIEMPO_LIMITE_MS`. `/buscador/resumen` tarda ~26 s. */
  tiempoLimiteMs?: number;
}

export async function infonif<T = unknown>(
  ruta: string,
  opciones: Opciones = {},
): Promise<T> {
  const { cuerpo, tiempoLimiteMs = config.INFONIF_TIEMPO_LIMITE_MS } = opciones;
  const metodo: Metodo = opciones.metodo ?? (cuerpo ? "POST" : "GET");
  const url = `${config.INFONIF_API_URL}${ruta}`;

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempoLimiteMs);
  const arranque = performance.now();

  try {
    const cabeceras: Record<string, string> = { accept: "application/json" };
    if (config.INFONIF_API_KEY) cabeceras["apikey"] = config.INFONIF_API_KEY;
    if (cuerpo) cabeceras["content-type"] = "application/json";

    const respuesta = await fetch(url, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: control.signal,
    });

    if (!respuesta.ok) {
      const detalle = (await respuesta.text()).slice(0, 500);
      throw new ErrorInfonif(respuesta.status, ruta, detalle);
    }

    const texto = await respuesta.text();
    registro.debug(
      { ruta, ms: Math.round(performance.now() - arranque), bytes: texto.length },
      "infonif",
    );
    return (texto ? JSON.parse(texto) : undefined) as T;
  } catch (error) {
    if (error instanceof ErrorInfonif) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ErrorInfonif(504, ruta, `sin respuesta en ${tiempoLimiteMs} ms`);
    }
    // `TypeError: fetch failed` no dice absolutamente nada: el motivo real
    // —socket muerto, DNS, certificado— vive en `cause`, a veces anidado.
    // Sin desenrollarlo, diagnosticar un fallo de red es adivinar.
    throw new ErrorInfonif(0, ruta, `${String(error)}${causaDe(error)}`);
  } finally {
    clearTimeout(temporizador);
  }
}

/** Desenrolla la cadena de `cause` de un error de red y la deja en una linea. */
function causaDe(error: unknown): string {
  const partes: string[] = [];
  let causa: unknown = (error as { cause?: unknown }).cause;

  for (let nivel = 0; causa && nivel < 4; nivel++) {
    const c = causa as { code?: string; message?: string };
    partes.push([c.code, c.message ?? String(causa)].filter(Boolean).join(" "));
    causa = (causa as { cause?: unknown }).cause;
  }

  return partes.length > 0 ? ` (${partes.join(" <- ")})` : "";
}

export interface EstadoInfonif {
  disponible: boolean;
  latenciaMs?: number;
  detalle?: string;
}

/** Para /salud/dependencias. Nunca lanza. Usa el autocompletado, que es rápido. */
export async function estadoInfonif(): Promise<EstadoInfonif> {
  const arranque = performance.now();
  try {
    await infonif("/buscador/autocomplete/listar?q=nia", { tiempoLimiteMs: 8000 });
    return { disponible: true, latenciaMs: Math.round(performance.now() - arranque) };
  } catch (error) {
    return { disponible: false, detalle: String(error) };
  }
}
