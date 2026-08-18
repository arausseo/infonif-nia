import { config } from "../../comun/config.js";
import { registro } from "../../comun/registro.js";
import { obtenerRedis } from "../redis/cliente.js";

/**
 * Dónde vive la `ICIF-APIKEY` del usuario conectado.
 *
 * **En Redis, del lado del servidor. NUNCA dentro del token de sesión.**
 *
 * Es tentador meterla en el token junto al `usuarioId` —viaja sola, caduca sola,
 * no hace falta almacén— y es exactamente lo que no se puede hacer: la carga del
 * token es `base64url`, **no va cifrada**. Está firmada, que impide falsificarla,
 * pero no impide leerla. Cualquiera con el token —el propio usuario abriendo la
 * consola del navegador, una extensión, un `document.cookie` de terceros— la
 * decodifica en dos líneas.
 *
 * Y esta clave no es como la `apikey` del buscador, que es pública a propósito y
 * solo abre datos abiertos. Esta **gasta créditos** del titular en cada llamada.
 * Filtrarla es regalar saldo.
 *
 * Así que el token sigue llevando solo el `usuarioId`, que es lo que siempre
 * llevó, y la clave se guarda aquí al acuñarlo. El identificador es la llave del
 * casillero, no su contenido.
 */

const PREFIJO = "nia:icif:clave:";

function clave(usuarioId: number): string {
  return `${PREFIJO}${usuarioId}`;
}

/**
 * Guarda la clave del usuario. La llama `/internal/mint`, servidor a servidor.
 *
 * Se vuelve a escribir en cada acuñación, así que el TTL se renueva mientras el
 * usuario siga navegando por el portal.
 */
export async function guardarClaveUsuario(
  usuarioId: number,
  apiKey: string,
): Promise<void> {
  try {
    await obtenerRedis().set(
      clave(usuarioId),
      apiKey,
      "EX",
      config.ICIF_CLAVE_TTL_SEGUNDOS,
    );
  } catch (error) {
    // No es fatal: se seguirá con la genérica. Pero conviene saberlo, porque el
    // síntoma —«a este usuario le cobran a Gedesco»— no apunta solo a Redis.
    registro.warn(
      { usuarioId, err: String(error) },
      "no se pudo guardar la ICIF-APIKEY del usuario",
    );
  }
}

/** De dónde salió la clave con la que se hizo una llamada. */
export type OrigenClave = "usuario" | "generica";

export interface ClaveResuelta {
  apiKey: string;
  origen: OrigenClave;
}

/**
 * Qué clave usar para este usuario.
 *
 * Orden: la suya; si no tiene, la genérica; si tampoco, nada — y entonces quien
 * llama decide qué contarle al usuario. Devolver `undefined` en vez de lanzar es
 * deliberado: «no hay clave» no es un fallo del sistema, es una condición
 * normal que la herramienta tiene que saber explicar.
 */
export async function resolverClave(
  usuarioId: number | undefined,
): Promise<ClaveResuelta | undefined> {
  if (usuarioId != null) {
    try {
      const propia = await obtenerRedis().get(clave(usuarioId));
      if (propia) return { apiKey: propia, origen: "usuario" };
    } catch (error) {
      registro.warn(
        { usuarioId, err: String(error) },
        "Redis no sirvió la ICIF-APIKEY; se intentará con la genérica",
      );
    }
  }

  const generica = config.ICIF_APIKEY_GENERICA;
  if (!generica || !config.ICIF_PERMITIR_GENERICA) return undefined;

  // A nivel debug y no info: en una conversación normal esto pasa en cada
  // llamada, y un aviso por llamada deja de leerse a la tercera.
  registro.debug({ usuarioId }, "usando la ICIF-APIKEY genérica");
  return { apiKey: generica, origen: "generica" };
}

/** Para /salud/dependencias: si hay respaldo configurado y si está permitido. */
export function estadoClaves(): { generica: boolean; permitida: boolean } {
  return {
    generica: Boolean(config.ICIF_APIKEY_GENERICA),
    permitida: config.ICIF_PERMITIR_GENERICA,
  };
}
