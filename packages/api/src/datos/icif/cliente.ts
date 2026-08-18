import { config } from "../../comun/config.js";
import { ErrorNia } from "../../comun/errores.js";
import { registro } from "../../comun/registro.js";
import { resolverClave, type OrigenClave } from "./claves.js";

/**
 * Cliente de `api.infonif.es/v1` (el gateway `icif-apigw`).
 *
 * Es un servicio distinto del buscador y hay que tratarlo como tal:
 *
 * | | buscador (`bbdd-api`) | gateway (`api.infonif.es/v1`) |
 * |---|---|---|
 * | Cabecera | `apikey` | `ICIF-APIKEY` |
 * | Clave | pública, del sitio | del usuario, **gasta créditos** |
 * | Método | GET y POST | POST siempre, NIF en el cuerpo |
 * | Sin datos | 200 con lista vacía | **204 sin cuerpo** |
 *
 * La diferencia que gobierna todo el diseño es la tercera fila: **cada llamada
 * que devuelve 200 descuenta un crédito** del titular de la clave. Un agente que
 * consulta «por si acaso» está gastando dinero de alguien. Por eso ninguna
 * herramienta de esta familia se llama de forma especulativa, todas declaran su
 * coste, y el 403 no se trata como un error sino como una respuesta prevista.
 */

const RUTAS_SIN_CREDITO = new Set<string>();

/** Qué pasó, en términos que una herramienta puede convertir en una frase. */
export type ResultadoIcif<T> =
  | { estado: "ok"; datos: T; origenClave: OrigenClave }
  | { estado: "sinDatos"; origenClave: OrigenClave }
  | { estado: "sinCreditos"; origenClave: OrigenClave }
  | { estado: "sinClave" };

interface Opciones {
  /** El cuerpo. Casi siempre `{ nif }`, a veces con `estado` o `tipo`. */
  cuerpo: object;
  tiempoLimiteMs?: number;
  senal?: AbortSignal;
}

/**
 * Llama al gateway con la clave que corresponda a este usuario.
 *
 * No lanza por 204 ni por 403: los dos son respuestas normales del negocio —«de
 * esta empresa no hay nada» y «se acabó el saldo»— y la herramienta necesita
 * distinguirlas para decir una cosa u otra. Lo que sí lanza es lo que de verdad
 * es un fallo: red, 5xx, y su código propio 460.
 */
export async function icif<T = unknown>(
  ruta: string,
  usuarioId: number | undefined,
  opciones: Opciones,
): Promise<ResultadoIcif<T>> {
  const clave = await resolverClave(usuarioId);
  if (!clave) return { estado: "sinClave" };

  const { cuerpo, tiempoLimiteMs = config.ICIF_TIEMPO_LIMITE_MS } = opciones;
  const url = `${config.ICIF_API_URL}${ruta}?tipo=json`;

  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempoLimiteMs);
  // Si el usuario cierra el chat, no hay razón para seguir gastando su saldo.
  const alAbortar = () => control.abort();
  opciones.senal?.addEventListener("abort", alAbortar, { once: true });
  const arranque = performance.now();

  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "ICIF-APIKEY": clave.apiKey,
      },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });

    const ms = Math.round(performance.now() - arranque);
    registro.debug({ ruta, estado: respuesta.status, ms, clave: clave.origen }, "icif");

    // 204: la empresa existe pero no hay nada de esto. No cobran por ello.
    if (respuesta.status === 204) {
      RUTAS_SIN_CREDITO.add(ruta);
      return { estado: "sinDatos", origenClave: clave.origen };
    }

    // 403: sin créditos. Es la respuesta que convierte una consulta en una
    // oportunidad de venta, así que sube tal cual hasta la herramienta.
    if (respuesta.status === 403) {
      registro.info(
        { ruta, usuarioId, clave: clave.origen },
        "el gateway dice que no hay créditos",
      );
      return { estado: "sinCreditos", origenClave: clave.origen };
    }

    // 401: la clave no vale. Que sea la genérica es un fallo de configuración
    // nuestro; que sea la del usuario, una clave caducada en el portal.
    if (respuesta.status === 401) {
      registro.warn(
        { ruta, clave: clave.origen },
        "el gateway rechaza la ICIF-APIKEY",
      );
      throw new ErrorIcif(401, ruta, "clave rechazada");
    }

    if (!respuesta.ok) {
      const detalle = (await respuesta.text()).slice(0, 500);
      throw new ErrorIcif(respuesta.status, ruta, detalle);
    }

    const texto = await respuesta.text();
    if (!texto) return { estado: "sinDatos", origenClave: clave.origen };

    return {
      estado: "ok",
      datos: JSON.parse(texto) as T,
      origenClave: clave.origen,
    };
  } catch (error) {
    if (error instanceof ErrorIcif) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ErrorIcif(504, ruta, `sin respuesta en ${tiempoLimiteMs} ms`);
    }
    throw new ErrorIcif(0, ruta, `${String(error)}${causaDe(error)}`);
  } finally {
    clearTimeout(temporizador);
    opciones.senal?.removeEventListener("abort", alAbortar);
  }
}

/**
 * Fallo del gateway.
 *
 * Su **460** es un 500 disfrazado: lo emiten cuando algo revienta por dentro y
 * no quieren decir qué. Se traduce a lenguaje corriente igual que cualquier
 * otro, porque para el usuario significa lo mismo.
 */
export class ErrorIcif extends ErrorNia {
  readonly estado: number;
  readonly ruta: string;

  constructor(estado: number, ruta: string, detalle: string) {
    super("INFONIF", `El gateway de Infonif respondió ${estado} en ${ruta}: ${detalle}`, {
      mensajeParaElModelo:
        estado === 401
          ? "No hay una credencial válida para consultar ese dato."
          : "El servicio de datos de empresa no responde ahora mismo.",
    });
    this.estado = estado;
    this.ruta = ruta;
  }
}

/** Igual que en el cliente del buscador: `fetch failed` a secas no dice nada. */
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
