import { config } from "../../comun/config.js";
import { ErrorNia } from "../../comun/errores.js";
import { registro } from "../../comun/registro.js";
import { resolverClave, type OrigenClave } from "./claves.js";

/**
 * Cliente de `api.infonif.es/v1` (el gateway `icif-apigw`).
 *
 * Es un servicio distinto del buscador y hay que tratarlo como tal:
 *
 * **Van DOS cabeceras, y son dos capas distintas.** Verificado contra el API
 * real, que es la única forma de saberlo: sobre `/dato/obtener-perfil-empresa`,
 *
 * - solo `x-api-key`   → 401 «Falta API Key» — no pasa de la puerta de la app
 * - solo `ICIF-APIKEY` → 403 «No tiene créditos» — pasó, y llegó al saldo
 * - las dos            → 403 «No tiene créditos»
 *
 * O sea: `x-api-key` es la puerta de AWS y `ICIF-APIKEY` es la cuenta de
 * créditos de su aplicación (su `apiKey()` busca `icif-apikey` en las
 * cabeceras). La familia `/buscador` solo pide la primera; `/dato` pide la
 * segunda. Se mandan ambas: hoy `/dato` no exige la de AWS, pero si algún día
 * activan el plan de uso, mandarla ya evita una caída sin motivo aparente.
 *
 * | | buscador (`bbdd-api`) | gateway (`api.infonif.es/v1`) |
 * |---|---|---|
 * | Cabecera | `apikey` | `ICIF-APIKEY` + `x-api-key` |
 * | Clave | pública, del sitio | del usuario, **gasta créditos** |
 * | Método | GET y POST | POST siempre, NIF en el cuerpo |
 * | Sin datos | 200 con lista vacía | **204 sin cuerpo** |
 *
 * Y la cuarta fila esconde lo que gobierna el diseño: esto **gasta saldo**. No
 * por llamada —es 1 crédito por NIF y mes, ver `dato.ts`— pero sí por empresa
 * nueva. Por eso el 403 no se trata como un error sino como una respuesta
 * prevista: significa «el dato existe, falta saldo», que es una frase muy
 * distinta de «no hay dato».
 */

/** Qué pasó, en términos que una herramienta puede convertir en una frase. */
export type ResultadoIcif<T> =
  | { estado: "ok"; datos: T; origenClave: OrigenClave }
  | { estado: "sinDatos"; origenClave: OrigenClave }
  | { estado: "sinCreditos"; origenClave: OrigenClave }
  /**
   * La credencial vale, pero no da acceso a ESE producto. Es la vía de «no lo
   * tiene comprado»: la familia `/producto` sirve cosas que el cliente compra en
   * la web, y quien valida la compra es el servicio de aguas arriba.
   */
  | { estado: "noAutorizado"; origenClave: OrigenClave }
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
        // Las dos, a propósito. Ver la cabecera del módulo: son capas distintas.
        "ICIF-APIKEY": clave.apiKey,
        "x-api-key": clave.apiKey,
      },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });

    const ms = Math.round(performance.now() - arranque);
    registro.debug({ ruta, estado: respuesta.status, ms, clave: clave.origen }, "icif");

    // 204: la empresa existe pero no hay nada de esto. No cobran por ello.
    if (respuesta.status === 204) {
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

    /**
     * Hay DOS 401 y significan cosas opuestas. Se distinguen por el texto, que
     * es feo pero es lo único que los separa:
     *
     * - «Falta API Key» lo emite el propio gateway cuando no ve la cabecera. Es
     *   un fallo nuestro de configuración.
     * - «No autorizado» viene traducido del servicio de aguas arriba, y quiere
     *   decir que la clave es buena pero no da acceso a ese producto — o sea,
     *   que el usuario no lo ha comprado.
     *
     * Confundirlos sería grave en las dos direcciones: tratar una compra que
     * falta como una avería deja de vender, y tratar una avería como una compra
     * que falta manda al usuario a pagar por algo que ya tiene.
     */
    if (respuesta.status === 401) {
      const detalle = (await respuesta.text()).slice(0, 300);

      if (/no autorizado/i.test(detalle)) {
        registro.info(
          { ruta, usuarioId, clave: clave.origen },
          "el producto no está contratado para esta clave",
        );
        return { estado: "noAutorizado", origenClave: clave.origen };
      }

      registro.warn({ ruta, clave: clave.origen }, "el gateway rechaza la clave");
      throw new ErrorIcif(401, ruta, detalle || "clave rechazada");
    }

    // 404: llegó al servicio y ahí no hay nada de esa empresa.
    if (respuesta.status === 404) {
      return { estado: "sinDatos", origenClave: clave.origen };
    }

    if (!respuesta.ok) {
      const detalle = (await respuesta.text()).slice(0, 500);
      throw new ErrorIcif(respuesta.status, ruta, detalle);
    }

    const texto = await respuesta.text();
    if (!texto) return { estado: "sinDatos", origenClave: clave.origen };

    const datos = JSON.parse(texto) as T;

    // TERCERA forma de decir «no hay nada», después del 204 y del 404: un 200
    // cuyo cuerpo es el JSON `""`. Lo devuelve `retir/obtener-socios` y se
    // encontró probando con un NIF real, no leyendo el código.
    //
    // Sin esto la herramienta contestaba «ok» con un dato vacío, que es la peor
    // de las tres salidas posibles: el modelo recibe una respuesta afirmativa y
    // se queda sin nada que decir, así que rellena el hueco él.
    if (estaVacio(datos)) {
      return { estado: "sinDatos", origenClave: clave.origen };
    }

    return { estado: "ok", datos, origenClave: clave.origen };
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

/**
 * ¿Esto es un «no hay datos» disfrazado de respuesta correcta?
 *
 * Cadena vacía, objeto sin claves o lista sin elementos. Los tres significan lo
 * mismo viniendo de este gateway, y ninguno es un dato que enseñar.
 */
function estaVacio(datos: unknown): boolean {
  if (datos == null) return true;
  if (typeof datos === "string") return datos.trim() === "";
  if (Array.isArray(datos)) return datos.length === 0;
  if (typeof datos === "object") return Object.keys(datos).length === 0;
  return false;
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
