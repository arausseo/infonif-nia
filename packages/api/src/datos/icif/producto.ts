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

/**
 * Titularidad real: quién está detrás de la sociedad.
 *
 * Son **datos de personas físicas**. Con la clave de pruebas responde 404 en vez
 * de 401, o sea que el acceso sí está concedido y simplemente no hay datos de
 * esa empresa. No se expone como herramienta todavía: antes hay que decidir bajo
 * qué base legal se sirve esto desde una conversación.
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
