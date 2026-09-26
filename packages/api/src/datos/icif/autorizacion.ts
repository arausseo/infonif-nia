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
 * ## Los estados
 *
 * - **preguntar** (por defecto) — cada empresa nueva necesita su sí.
 * - la lista de NIF ya autorizados uno a uno.
 * - **sesion** — adelante mientras dure esta conversación.
 * - **siempre** — adelante también en las conversaciones siguientes.
 *
 * Los tres primeros viven en la conversación y mueren con ella. El cuarto no:
 * se guarda contra el USUARIO y sobrevive a la sesión.
 *
 * Al principio `siempre` no existía a propósito —un permiso que el usuario no
 * recuerda haber dado se parece demasiado a una suposición— pero es su saldo y
 * lo pidió. Lo que evita que se convierta en una suposición son tres cosas, y
 * ninguna es opcional:
 *
 * 1. **Caduca** a los 90 días. Un permiso permanente de verdad acabaría
 *    gastando saldo de alguien que ya ni se acuerda.
 * 2. **Se dice.** La primera vez que se usa en una conversación nueva, el
 *    agente avisa de que está activo (lo indica el prompt).
 * 3. **Se retira** con el mismo «revocar», que limpia las dos capas.
 *
 * Y necesita `usuarioId`: sin él no hay a quién asociarlo. Un anónimo puede
 * autorizar la sesión, nunca el «siempre».
 */

const PREFIJO = "nia:icif:autorizacion:";
/** Lo que dura una conversación con holgura. Al caducar se vuelve a preguntar. */
const TTL_SEGUNDOS = 86_400;

/** El permiso permanente, por usuario. Se renueva cada vez que se usa. */
const PREFIJO_USUARIO = "nia:icif:autorizacion:usuario:";
/** 90 días. Pasados, se vuelve a preguntar una vez y a correr. */
const TTL_SIEMPRE_SEGUNDOS = 7_776_000;

export type ModoAutorizacion = "preguntar" | "sesion" | "siempre";

export interface Autorizacion {
  modo: ModoAutorizacion;
  /** NIF autorizados de uno en uno. */
  nifs: string[];
  /** Si hay que ir contando el saldo gastado. El usuario puede pedir que no. */
  informar: boolean;
  /**
   * Si ya se le ha recordado en ESTA conversación que tiene el permiso
   * permanente activo. Se avisa una vez, no en cada consulta.
   */
  avisadoSiempre?: boolean;
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
      ...(leido.avisadoSiempre === true ? { avisadoSiempre: true } : {}),
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

// ─── El permiso permanente, por usuario ──────────────────────────────────────

function claveUsuario(usuarioId: number): string {
  return `${PREFIJO_USUARIO}${usuarioId}`;
}

/**
 * ¿Este usuario dejó dicho que no se le pregunte más, ni siquiera en
 * conversaciones nuevas?
 *
 * Falla cerrado: si Redis no responde, se preguntará. Preguntar de más molesta;
 * gastar de más cuesta dinero.
 */
export async function tieneAutorizacionPermanente(
  usuarioId: number | undefined,
): Promise<boolean> {
  if (usuarioId == null) return false;
  try {
    return (await obtenerRedis().get(claveUsuario(usuarioId))) !== null;
  } catch (error) {
    registro.warn(
      { usuarioId, err: String(error) },
      "no se pudo leer la autorización permanente; se preguntará",
    );
    return false;
  }
}

/** Deja dicho que sí para las próximas conversaciones. Caduca a los 90 días. */
export async function autorizarSiempre(usuarioId: number | undefined): Promise<boolean> {
  if (usuarioId == null) return false;
  try {
    await obtenerRedis().set(
      claveUsuario(usuarioId),
      new Date().toISOString(),
      "EX",
      TTL_SIEMPRE_SEGUNDOS,
    );
    registro.info({ usuarioId }, "el usuario autoriza sus créditos de forma permanente");
    return true;
  } catch (error) {
    registro.warn(
      { usuarioId, err: String(error) },
      "no se pudo guardar la autorización permanente",
    );
    return false;
  }
}

/** Lo retira. Un permiso que no se puede retirar no es un permiso. */
export async function revocarSiempre(usuarioId: number | undefined): Promise<void> {
  if (usuarioId == null) return;
  try {
    await obtenerRedis().del(claveUsuario(usuarioId));
    registro.info({ usuarioId }, "retirada la autorización permanente");
  } catch (error) {
    registro.warn(
      { usuarioId, err: String(error) },
      "no se pudo retirar la autorización permanente",
    );
  }
}

/** ¿Se puede consultar este NIF sin volver a preguntar? */
export async function estaAutorizado(
  conversacionId: string | undefined,
  nif: string,
  usuarioId?: number,
): Promise<boolean> {
  const autorizacion = await leerAutorizacion(conversacionId);
  if (autorizacion.modo === "sesion" || autorizacion.nifs.includes(normalizar(nif))) {
    return true;
  }
  return tieneAutorizacionPermanente(usuarioId);
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
export async function revocarSesion(
  conversacionId: string | undefined,
  usuarioId?: number,
): Promise<void> {
  // Se limpian LAS DOS capas. Si solo se borrara la de la conversación, el
  // usuario diría «deja de gastar» y seguiríamos gastando por el permiso
  // permanente: exactamente lo contrario de lo que acaba de pedir.
  await revocarSiempre(usuarioId);

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

/**
 * Marca que ya se le ha avisado del permiso permanente en esta conversación.
 *
 * Devuelve si era la primera vez. Sirve para decirlo UNA vez: repetirlo en cada
 * consulta sería ruido, y no decirlo nunca deja al usuario gastando saldo por
 * un permiso que dio hace semanas y no recuerda.
 */
export async function marcarAvisoSiempre(
  conversacionId: string | undefined,
): Promise<boolean> {
  if (!conversacionId) return false;
  const autorizacion = await leerAutorizacion(conversacionId);
  if (autorizacion.avisadoSiempre) return false;
  autorizacion.avisadoSiempre = true;
  await guardar(conversacionId, autorizacion);
  return true;
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
