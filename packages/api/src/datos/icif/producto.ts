import { z } from "zod";
import { icif, type ResultadoIcif } from "./cliente.js";

/**
 * Familia `/producto`: entregar lo que el cliente ya compró.
 *
 * **Estas operaciones NO cobran.** Es lo que más despista de todo el gateway y
 * conviene dejarlo escrito: `solicitar-*` suena a «comprar» y no lo es. El
 * cliente compra el producto en la web, y esto solo pide que se le entregue.
 * Quien comprueba que la compra existe es el servicio de aguas arriba.
 *
 * Por eso no chocan con la regla de que el agente no ejecuta cobros: aquí no hay
 * cobro que ejecutar. Y por eso tampoco pasan por el control de créditos de
 * consulta —son otra moneda distinta— cosa que se ve en su código: ninguna llama
 * a `deductCredits`.
 *
 * Los contratos de abajo están **comprobados contra el API real**, uno a uno,
 * porque no había forma de deducirlos: el `serverless.yml` no los describe y el
 * código del gateway solo reenvía.
 *
 * Lo que devuelven cuando algo falta también está comprobado:
 *
 * | Respuesta | Qué significa |
 * |---|---|
 * | `401 No autorizado` | la clave no da acceso a ese producto: no está comprado |
 * | `404` | llegó al servicio y de esa empresa no hay nada |
 * | `400 Falta el campo …` | falta un parámetro; el mensaje dice cuál |
 */

/** El RAI: si la empresa figura con impagados. Cuerpo `{ nif }`. */
export async function obtenerRai(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/obtener-rai", usuarioId, {
    cuerpo: { nif },
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

/**
 * Pide que se prepare el RAI de una empresa.
 *
 * «Solicitar» es pedir la entrega, no comprar. Devuelve lo que haga falta para
 * luego recuperarlo con `obtenerRai`.
 */
export async function solicitarRai(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/solicitar-rai", usuarioId, {
    cuerpo: { nif },
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

/**
 * Situación concursal de una empresa. Cuerpo `{ nif }`.
 *
 * Es un hecho registral (si consta concurso u otro procedimiento), no una
 * valoración de solvencia. No confundir con el RAI (impagados) ni con el
 * Informe de Riesgo.
 */
export async function obtenerSituacionConcursal(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/obtener-situacion-concursal", usuarioId, {
    cuerpo: { nif },
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

/** Los dos únicos tipos que admite su API (`getTipoInforme`). */
export const TipoInforme = z.enum(["6", "11"]);
export type TipoInforme = z.infer<typeof TipoInforme>;

export async function solicitarInforme(
  nif: string,
  tipo: TipoInforme,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/solicitar-informe", usuarioId, {
    cuerpo: { nif, tipo },
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

/** Recupera un informe ya solicitado. El `id` sale de `solicitarInforme`. */
export async function obtenerInforme(
  id: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/obtener-informe", usuarioId, {
    cuerpo: { id },
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

/**
 * Las cuentas anuales de un ejercicio.
 *
 * **`consolidado` es obligatorio y no tiene valor por defecto**: su API responde
 * `400 Falta el campo consolidado` si no va, incluso llevando NIF y ejercicio.
 * Se descubrió probando, porque no está en ninguna parte.
 *
 * `false` son las cuentas individuales, que es lo que quiere casi todo el mundo;
 * `true`, las del grupo consolidado.
 */
export interface PeticionDeposito {
  nif: string;
  ejercicio: string;
  consolidado?: boolean;
}

function cuerpoDeposito({ nif, ejercicio, consolidado }: PeticionDeposito) {
  return { nif, ejercicio, consolidado: consolidado ?? false };
}

/**
 * ¿Tiene el usuario comprado este depósito?
 *
 * **Es la comprobación que hay que hacer antes de intentar la descarga**, y la
 * única de la familia que responde algo legible cuando la respuesta es que no:
 *
 *     {"response":{"estado":-1,"mensaje":"No tiene compra registrada"}}
 *
 * Sin esto, `obtener-deposito-pdf` devuelve un 404 mudo que se confunde con «esa
 * empresa no depositó ese año», que es una cosa completamente distinta. Uno se
 * arregla comprando y el otro no se arregla.
 */
export interface EstadoDeposito {
  /** -1 es «no tiene compra registrada». El resto de valores, sin confirmar. */
  estado: number;
  mensaje: string;
  comprado: boolean;
}

export async function estadoPartidasDeposito(
  peticion: PeticionDeposito,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<EstadoDeposito>> {
  const bruto = await icif<{ response?: { estado?: number; mensaje?: string } }>(
    "/producto/estado-partidas-deposito",
    usuarioId,
    {
      cuerpo: cuerpoDeposito(peticion),
      ...(opciones.senal ? { senal: opciones.senal } : {}),
    },
  );
  if (bruto.estado !== "ok") return bruto;

  const estado = bruto.datos.response?.estado ?? -1;
  return {
    estado: "ok",
    datos: {
      estado,
      mensaje: bruto.datos.response?.mensaje ?? "",
      // Solo el -1 está confirmado contra el API. Cualquier otro valor se toma
      // como comprado, que es el lado seguro: si acaso se intenta la descarga y
      // esa sí falla de forma explícita.
      comprado: estado !== -1,
    },
    origenClave: bruto.origenClave,
  };
}

/**
 * Dónde está el PDF del depósito.
 *
 * **Cuidado con lo que devuelve.** Según los ejemplos de Infonif no es una URL,
 * sino una ruta UNC de un recurso compartido de Windows:
 *
 *     \SNOW\CUENTASRM4µ\A26563668\INDIVIDUALES\A26563668.pdf
 *     \192.168.1.202\Documentacion Escaneada Librados\C\…\MRM010874473.pdf
 *
 * Eso tiene dos consecuencias. La primera es que **no se le puede enseñar al
 * usuario**: no es un enlace que pueda pulsar, y además expone la topología
 * interna. La segunda es que leerlo exige estar en esa red con SMB montado, cosa
 * que esta máquina no está.
 *
 * Por eso `rutaInterna()` separa una cosa de otra: si lo que vuelve es http(s),
 * es un enlace y se puede entregar; si es UNC, se sabe que el fichero existe pero
 * la entrega tiene que resolverla otro.
 */
export async function obtenerDepositoPdf(
  peticion: PeticionDeposito,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/obtener-deposito-pdf", usuarioId, {
    cuerpo: cuerpoDeposito(peticion),
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

export async function obtenerPartidasDeposito(
  peticion: PeticionDeposito,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/obtener-partidas-deposito", usuarioId, {
    cuerpo: cuerpoDeposito(peticion),
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

export async function solicitarDeposito(
  peticion: PeticionDeposito,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/solicitar-deposito", usuarioId, {
    cuerpo: cuerpoDeposito(peticion),
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

// ─── Titularidad real y socios ───────────────────────────────────────────────

/**
 * Quién está detrás de una sociedad.
 *
 * **Esto son datos de personas físicas y el RGPD aplica.** No es una cautela
 * decorativa: la titularidad real identifica a personas concretas por su nombre y
 * su participación, y el registro existe para prevención de blanqueo, no para
 * perfilar a nadie.
 *
 * Lo que hace el código para que eso no se desmande:
 *
 * - **No se consulta salvo que lo pidan.** Las descripciones de las herramientas
 *   lo dicen explícitamente, porque una consulta especulativa aquí no es como
 *   consultar el CNAE.
 * - **Va de sociedad a personas, nunca al revés.** No hay forma de buscar en qué
 *   sociedades está una persona, y no se va a añadir aunque su API lo permitiera.
 * - **Si no está contratado, no hay dato.** El 401 de aguas arriba se respeta
 *   igual que en el resto: el dato no entra al contexto del modelo.
 *
 * Hay **dos vías** y devuelven cosas distintas. Comprobado con la clave de
 * pruebas sobre Mercadona:
 *
 * | Ruta | Respuesta | Lectura |
 * |---|---|---|
 * | `producto/obtener-titularidad-real` | 404 | hay acceso, no hay dato |
 * | `producto/retir/obtener-declaracion-titularidad-real` | 401 | no contratado |
 * | `producto/retir/obtener-socios` | 200 vacío | hay acceso, no hay dato |
 * | `producto/retir-socios` | 404 | la ruta vieja |
 *
 * Se usan las dos que responden con acceso concedido, y la declaración RETIR
 * queda como complemento para quien la tenga contratada.
 */
export async function obtenerTitularidadReal(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/obtener-titularidad-real", usuarioId, {
    cuerpo: { nif },
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

/**
 * La declaración de titularidad real del RETIR.
 *
 * Es el documento formal, frente al dato suelto de `obtenerTitularidadReal`.
 * Requiere contratación aparte: con la clave de pruebas responde 401.
 */
export async function obtenerDeclaracionTitularidadReal(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/retir/obtener-declaracion-titularidad-real", usuarioId, {
    cuerpo: { nif },
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

/**
 * Los socios de una sociedad.
 *
 * Se usa la ruta nueva (`retir/obtener-socios`): la vieja `retir-socios`
 * responde 404 sobre el mismo NIF donde la nueva responde 200.
 *
 * Ojo con la respuesta vacía: devuelve **200 con cuerpo vacío** cuando no hay
 * datos, no un 204. El cliente ya lo trata como «sin datos», pero conviene
 * saberlo porque es otra convención distinta de la del resto del gateway.
 */
export async function obtenerSocios(
  nif: string,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<unknown>> {
  return icif("/producto/retir/obtener-socios", usuarioId, {
    cuerpo: { nif },
    ...(opciones.senal ? { senal: opciones.senal } : {}),
  });
}

/** ¿Es una ruta de red interna (UNC o unidad de Windows) en vez de un enlace? */
export function esRutaInterna(valor: string): boolean {
  return valor.startsWith("\\\\") || /^[a-zA-Z]:\\/.test(valor);
}

/**
 * Saca del resultado algo que se pueda entregar.
 *
 * Devuelve el enlace solo si de verdad lo es. Una ruta UNC se reconoce pero no
 * se propaga: enseñar una ruta de red en un chat no le sirve de nada al usuario
 * y de paso le cuenta cómo se llaman los servidores de dentro.
 */
export function enlaceDeDeposito(datos: unknown): {
  enlace?: string;
  hayFichero: boolean;
} {
  const candidatos: string[] = [];
  const recorrer = (v: unknown, hondura = 0) => {
    if (hondura > 4) return;
    if (typeof v === "string") candidatos.push(v);
    else if (Array.isArray(v)) v.forEach((x) => recorrer(x, hondura + 1));
    else if (v && typeof v === "object") {
      Object.values(v).forEach((x) => recorrer(x, hondura + 1));
    }
  };
  recorrer(datos);

  const enlace = candidatos.find((c) => /^https?:\/\//i.test(c));
  if (enlace) return { enlace, hayFichero: true };

  return { hayFichero: candidatos.some((c) => esRutaInterna(c)) };
}
