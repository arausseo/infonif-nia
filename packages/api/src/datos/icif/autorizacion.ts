import { registro } from "../../comun/registro.js";
import { obtenerRedis } from "../redis/cliente.js";

/**
 * Permiso del usuario para gastar sus créditos de consulta.
 *
 * **La comprobación está aquí, en el código, no en el prompt.** Es la misma
 * razón de siempre: un prompt no es un control. Si esto viviera solo en las
 * instrucciones, bastaría con que el modelo se despistara —o con que alguien le
 * insistiera— para que empezara a gastar saldo ajeno sin preguntar. Aquí no hay
 * despiste posible: sin permiso registrado, la llamada no sale.
 *
 * ## Qué se autoriza exactamente
 *
 * Una **empresa**, no una consulta. Porque el coste es por NIF y por mes: una
 * vez abierta una empresa, mirar sus cargos, su balance y su BORME no cuesta
 * nada más. Pedir permiso para cada herramienta sería pedir cuatro veces lo
 * mismo y cobrar una, que es la peor manera de tratar a alguien.
 *
 * ## Los tres estados
 *
 * - **preguntar** (por defecto) — cada empresa nueva necesita su sí.
 * - **sesion** — el usuario ha dicho que adelante, y no se le vuelve a
 *   preguntar mientras dure la conversación.
 * - la lista de NIF ya autorizados uno a uno.
 *
 * El permiso vive en la conversación y muere con ella. No se guarda un «este
 * usuario siempre dice que sí» entre sesiones: eso ya no sería un permiso, sería
 * una suposición.
 */

const PREFIJO = "nia:icif:autorizacion:";
/** Lo que dura una conversación con holgura. Al caducar se vuelve a preguntar. */
const TTL_SEGUNDOS = 86_400;

export type ModoAutorizacion = "preguntar" | "sesion";

export interface Autorizacion {
  modo: ModoAutorizacion;
  /** NIF autorizados de uno en uno. */
  nifs: string[];
  /** Si hay que ir contando el saldo gastado. El usuario puede pedir que no. */
  informar: boolean;
  /**
   * Último saldo que vimos, para poder decir cuánto ha costado ESTA consulta.
   *
   * El gateway no dice si ha cobrado: cobra 1 crédito la primera vez que se abre
   * una empresa en el mes y nada las siguientes, pero responde igual en los dos
   * casos. Restando contra el último saldo conocido sale el gasto real, y
   * preguntarlo es gratis.
   */
  ultimoSaldo?: number;
}

/**
 * El estado por defecto, **como función y no como constante**.
 *
 * Era una constante, y esparcirla con `{ ...defecto }` copiaba el objeto pero no
 * el array `nifs`, que quedaba compartido por referencia. `autorizarNif` lo
 * mutaba con un push y, a partir de ahí, **todas** las conversaciones nacían con
 * ese NIF ya autorizado: el permiso de un usuario abría la puerta a los demás.
 *
 * Lo cazó un test. Compilaba, no lanzaba nada y el caso normal funcionaba —que
 * es exactamente el perfil de fallo que llega a producción.
 */
function porDefecto(): Autorizacion {
  return { modo: "preguntar", nifs: [], informar: true };
}

function clave(conversacionId: string): string {
  return `${PREFIJO}${conversacionId}`;
}

export async function leerAutorizacion(
  conversacionId: string | undefined,
): Promise<Autorizacion> {
  if (!conversacionId) return porDefecto();
  try {
    const crudo = await obtenerRedis().get(clave(conversacionId));
    if (!crudo) return porDefecto();
    const leido = JSON.parse(crudo) as Partial<Autorizacion>;
    return {
      modo: leido.modo === "sesion" ? "sesion" : "preguntar",
      nifs: Array.isArray(leido.nifs) ? leido.nifs : [],
      informar: leido.informar !== false,
      ...(typeof leido.ultimoSaldo === "number"
        ? { ultimoSaldo: leido.ultimoSaldo }
        : {}),
    };
  } catch (error) {
    // Si Redis falla, se cae del lado de PREGUNTAR. Nunca del de gastar.
    registro.warn(
      { conversacionId, err: String(error) },
      "no se pudo leer la autorización de créditos; se preguntará",
    );
    return porDefecto();
  }
}

async function guardar(
  conversacionId: string,
  autorizacion: Autorizacion,
): Promise<void> {
  try {
    await obtenerRedis().set(
      clave(conversacionId),
      JSON.stringify(autorizacion),
      "EX",
      TTL_SEGUNDOS,
    );
  } catch (error) {
    registro.warn(
      { conversacionId, err: String(error) },
      "no se pudo guardar la autorización de créditos",
    );
  }
}

/** ¿Se puede consultar este NIF sin volver a preguntar? */
export async function estaAutorizado(
  conversacionId: string | undefined,
  nif: string,
): Promise<boolean> {
  const autorizacion = await leerAutorizacion(conversacionId);
  return autorizacion.modo === "sesion" || autorizacion.nifs.includes(normalizar(nif));
}

/** Autoriza una empresa concreta. */
export async function autorizarNif(
  conversacionId: string | undefined,
  nif: string,
): Promise<void> {
  if (!conversacionId) return;
  const autorizacion = await leerAutorizacion(conversacionId);
  const limpio = normalizar(nif);
  if (!autorizacion.nifs.includes(limpio)) autorizacion.nifs.push(limpio);
  await guardar(conversacionId, autorizacion);
}

/** Autoriza el resto de la conversación, sin volver a preguntar. */
export async function autorizarSesion(conversacionId: string | undefined): Promise<void> {
  if (!conversacionId) return;
  const autorizacion = await leerAutorizacion(conversacionId);
  autorizacion.modo = "sesion";
  await guardar(conversacionId, autorizacion);
}

/**
 * Vuelve a pedir permiso empresa por empresa.
 *
 * Existe porque un permiso que no se puede retirar no es un permiso.
 */
export async function revocarSesion(conversacionId: string | undefined): Promise<void> {
  if (!conversacionId) return;
  const autorizacion = await leerAutorizacion(conversacionId);
  autorizacion.modo = "preguntar";
  autorizacion.nifs = [];
  await guardar(conversacionId, autorizacion);
}

/** El usuario decide si quiere el recuento de saldo o le sobra. */
export async function fijarInformar(
  conversacionId: string | undefined,
  informar: boolean,
): Promise<void> {
  if (!conversacionId) return;
  const autorizacion = await leerAutorizacion(conversacionId);
  autorizacion.informar = informar;
  await guardar(conversacionId, autorizacion);
}

/** Apunta el saldo que acabamos de ver, para saber cuánto cuesta la próxima. */
export async function recordarSaldo(
  conversacionId: string | undefined,
  saldo: number,
): Promise<void> {
  if (!conversacionId) return;
  const autorizacion = await leerAutorizacion(conversacionId);
  autorizacion.ultimoSaldo = saldo;
  await guardar(conversacionId, autorizacion);
}

/** Sin espacios ni guiones y en mayúsculas: «b-98001720» y «B98001720» son uno. */
function normalizar(nif: string): string {
  return nif.trim().toUpperCase().replace(/[\s-]/g, "");
}
