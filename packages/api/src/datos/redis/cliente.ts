import Redis from "ioredis";
import { config } from "../../comun/config.js";
import { registro } from "../../comun/registro.js";

/**
 * Conexión única y perezosa. En Redis viven las conversaciones, la caché de
 * consultas semánticas y las claves de idempotencia de compra. Nunca datos de
 * pago.
 */
let cliente: Redis | undefined;

export function obtenerRedis(): Redis {
  if (!cliente) {
    cliente = new Redis(config.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (intentos) => Math.min(intentos * 200, 2000),
    });
    cliente.on("error", (error: Error) => {
      registro.warn({ err: error.message }, "Redis no disponible");
    });
  }
  return cliente;
}

export async function cerrarRedis(): Promise<void> {
  if (cliente) {
    await cliente.quit().catch(() => cliente?.disconnect());
    cliente = undefined;
  }
}

export interface EstadoRedis {
  disponible: boolean;
  detalle?: string;
}

/** Para /salud/dependencias. Nunca lanza. */
export async function estadoRedis(): Promise<EstadoRedis> {
  try {
    const redis = obtenerRedis();
    if (redis.status === "wait" || redis.status === "end") await redis.connect();
    const respuesta = await redis.ping();
    return { disponible: respuesta === "PONG" };
  } catch (error) {
    return { disponible: false, detalle: String(error) };
  }
}
