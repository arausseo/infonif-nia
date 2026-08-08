import {
  normalizar,
  recomendarProducto as recomendarProductoSinCache,
  resolverActividad as resolverActividadSinCache,
  usarVectorizador,
  vectorizadorLocal,
  type ProductoRecomendado,
  type Resolucion,
} from "@nia/semantica";
import { registro } from "../comun/registro.js";
import { obtenerRedis } from "./redis/cliente.js";

/**
 * La capa semántica, con caché y con el modelo cargado en diferido.
 *
 * `@nia/semantica` no sabe nada de Redis ni de ONNX a propósito: aquí se le
 * inyecta el vectorizador y se le pone la caché delante. Así el paquete se puede
 * probar sin infraestructura y el modelo solo se carga si de verdad hace falta.
 *
 * La caché va por **consulta normalizada**: «Logística», «logistica» y
 * «  LOGÍSTICA » son la misma entrada. Los códigos CNAE de una expresión no
 * cambian de un día para otro, así que se guardan un mes.
 */

const PREFIJO = "nia:semantica:v1";
const TTL_SEGUNDOS = 30 * 24 * 3600;

let cargando: Promise<void> | undefined;

/**
 * Carga el modelo local. Tarda unos segundos la primera vez y descarga ~120 MB
 * si no está en caché de disco.
 *
 * No se llama al arrancar: la mayoría de las consultas las resuelven los
 * términos curados sin tocar el modelo, y arrancar el servicio no debería
 * esperar por algo que quizá no se use.
 */
export async function prepararSemantica(): Promise<void> {
  if (!cargando) {
    cargando = (async () => {
      const arranque = performance.now();
      usarVectorizador(await vectorizadorLocal());
      registro.info(
        { ms: Math.round(performance.now() - arranque) },
        "modelo semántico cargado",
      );
    })().catch((error: unknown) => {
      cargando = undefined;
      registro.error({ err: String(error) }, "no se pudo cargar el modelo semántico");
      throw error;
    });
  }
  return cargando;
}

async function cacheado<T>(clave: string, calcular: () => Promise<T>): Promise<T> {
  const completa = `${PREFIJO}:${clave}`;

  try {
    const guardado = await obtenerRedis().get(completa);
    if (guardado) return JSON.parse(guardado) as T;
  } catch (error) {
    registro.warn({ err: String(error) }, "Redis no sirvió la caché semántica");
  }

  const resultado = await calcular();

  try {
    await obtenerRedis().set(completa, JSON.stringify(resultado), "EX", TTL_SEGUNDOS);
  } catch {
    // Sin caché se sigue funcionando; solo se paga el modelo otra vez.
  }

  return resultado;
}

/** Texto libre → códigos CNAE, con caché por consulta normalizada. */
export async function resolverActividad(
  consulta: string,
  limite?: number,
): Promise<Resolucion> {
  const clave = `actividad:${normalizar(consulta)}:${limite ?? 5}`;
  return cacheado(clave, async () => {
    await prepararSemantica().catch(() => undefined);
    return resolverActividadSinCache(consulta, limite);
  });
}

/** Situación del cliente → producto, con caché. */
export async function recomendarProducto(
  situacion: string,
  limite?: number,
): Promise<ProductoRecomendado[]> {
  const clave = `producto:${normalizar(situacion)}:${limite ?? 3}`;
  return cacheado(clave, async () => {
    await prepararSemantica().catch(() => undefined);
    return recomendarProductoSinCache(situacion, limite);
  });
}
