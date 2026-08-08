import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../comun/config.js";
import { ErrorValidacion } from "../comun/errores.js";

/**
 * Puente de sesión con el ASP Classic (CONTRATOS §5).
 *
 * El ASP llama servidor a servidor a `POST /internal/mint` con el secreto
 * compartido, y recibe un token firmado de 15 minutos que inyecta en la página.
 * El widget lo manda en cada turno.
 *
 * **Esto sustituye al `usuarioId` que hasta ahora viajaba en el cuerpo.** Aquel
 * apaño valía para probar el bucle, pero cualquiera podría haber dicho que era
 * el usuario 133627 y ver datos de pago. Un usuario no decide quién es.
 *
 * Token propio en vez de JWT: son tres campos y una firma, no merece una
 * dependencia. HMAC-SHA256 sobre el payload en base64url.
 */

export interface Sesion {
  usuarioId: number;
  /** Segundos desde epoch en que caduca. */
  caduca: number;
}

function base64url(dato: Buffer | string): string {
  return Buffer.from(dato)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function desdeBase64url(texto: string): Buffer {
  return Buffer.from(texto.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function firmar(carga: string, secreto: string): string {
  return base64url(createHmac("sha256", secreto).update(carga).digest());
}

/** Acuña un token para un usuario. El secreto lo aporta la configuración. */
export function acunarToken(usuarioId: number, ahora: number = Date.now()): string {
  const secreto = config.AGENT_SHARED_SECRET;
  if (!secreto) {
    throw new ErrorValidacion("Falta AGENT_SHARED_SECRET: no se pueden acuñar tokens");
  }

  const sesion: Sesion = {
    usuarioId,
    caduca: Math.floor(ahora / 1000) + config.TOKEN_TTL_SEGUNDOS,
  };

  const carga = base64url(JSON.stringify(sesion));
  return `${carga}.${firmar(carga, secreto)}`;
}

/**
 * Valida un token. Devuelve `undefined` si no vale, sin decir por qué: a quien
 * manda un token falso no se le explica en qué ha fallado.
 */
export function validarToken(
  token: string | undefined,
  ahora: number = Date.now(),
): Sesion | undefined {
  const secreto = config.AGENT_SHARED_SECRET;
  if (!token || !secreto) return undefined;

  const partes = token.split(".");
  if (partes.length !== 2) return undefined;
  const [carga, firma] = partes as [string, string];

  const esperada = firmar(carga, secreto);
  // Comparación en tiempo constante: comparar con === filtra el secreto poco a
  // poco a quien mida los tiempos.
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;

  try {
    const sesion = JSON.parse(desdeBase64url(carga).toString("utf8")) as Sesion;
    if (typeof sesion.usuarioId !== "number" || typeof sesion.caduca !== "number") {
      return undefined;
    }
    if (sesion.caduca * 1000 < ahora) return undefined;
    return sesion;
  } catch {
    return undefined;
  }
}

/** `true` si el secreto que manda el ASP es el nuestro. */
export function secretoValido(recibido: string | undefined): boolean {
  const secreto = config.AGENT_SHARED_SECRET;
  if (!secreto || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(secreto);
  return a.length === b.length && timingSafeEqual(a, b);
}
