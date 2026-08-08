import { registro } from "../comun/registro.js";
import { infonif } from "./infonif/cliente.js";
import { PlanBBDD } from "./infonif/tipos.js";

/**
 * Derechos del usuario: si tiene plan de registros y cuánto saldo le queda.
 *
 * ADR-008: esto se consulta **dentro del ejecutor de la herramienta, antes de
 * devolver el dato**. Si no hay derecho, la herramienta devuelve
 * `{ requiereCompra: true, skuSugerido }` y el dato de pago no entra al contexto
 * del modelo. Nunca se le pide al modelo que «no lo mencione».
 *
 * La fuente es su API (`GET /buscador/planBBDD`), no SQL Server: así Nia ve
 * exactamente el mismo saldo que el portal le enseña al usuario en la misma
 * pantalla.
 *
 * **Un plan se consume en registros, no en euros, y da igual cuántos campos se
 * lleve el usuario.** Verificado contra su portal: 50 empresas con cinco campos
 * seleccionados descuentan 50 registros, no 207. Eso cambia por completo lo que
 * hay que decirle a quien tiene plan: no se le cotiza un importe, se le dice
 * cuánto saldo va a gastar.
 */

export type Perfil = "anonimo" | "registrado" | "conPlan";

export interface Derechos {
  perfil: Perfil;
  usuarioId?: number;
  /** Registros contratados en total, no mensuales pese al nombre de su API. */
  registrosContratados?: number;
  registrosConsumidos?: number;
  registrosDisponibles?: number;
  /** Fin del contrato, en ISO. Pasada esa fecha el plan no vale. */
  finContrato?: string;
  /** Puede descargar consumiendo saldo en lugar de pagar. */
  puedeConsumirSaldo: boolean;
}

export const DERECHOS_ANONIMO: Derechos = {
  perfil: "anonimo",
  puedeConsumirSaldo: false,
};

/** Traduce la respuesta de su API a nuestros derechos. Pura, para poder probarla. */
export function interpretarPlan(
  usuarioId: number,
  plan: PlanBBDD | undefined,
  ahora: number = Date.now(),
): Derechos {
  const sinPlan: Derechos = {
    perfil: "registrado",
    usuarioId,
    puedeConsumirSaldo: false,
  };

  // Sin plan, su API devuelve 204 sin cuerpo.
  if (!plan || plan.iD_usuario == null) return sinPlan;

  const contratados = plan.numRegistrosMensuales ?? 0;
  const consumidos = plan.numRegistrosConsumidos ?? 0;
  const disponibles = Math.max(0, contratados - consumidos);

  const vencido =
    plan.fechaFinContrato != null && Date.parse(plan.fechaFinContrato) < ahora;

  const derechos: Derechos = {
    perfil: "conPlan",
    usuarioId,
    registrosContratados: contratados,
    registrosConsumidos: consumidos,
    registrosDisponibles: disponibles,
    puedeConsumirSaldo: disponibles > 0 && !vencido,
  };
  if (plan.fechaFinContrato != null) derechos.finContrato = plan.fechaFinContrato;
  return derechos;
}

/**
 * Resuelve los derechos de un usuario.
 *
 * Nunca lanza: si su API no responde, se degrada a «registrado sin plan», que es
 * el caso restrictivo. Regalar una descarga por un fallo de red sería peor que
 * pedir que se compre.
 */
export async function resolverDerechos(usuarioId?: number): Promise<Derechos> {
  if (usuarioId === undefined || usuarioId <= 0) return DERECHOS_ANONIMO;

  try {
    const crudo = await infonif(`/buscador/planBBDD?idusuario=${usuarioId}`, {
      tiempoLimiteMs: 8000,
    });
    // 204 sin cuerpo: el usuario existe pero no tiene plan.
    const plan = crudo === undefined ? undefined : PlanBBDD.parse(crudo);
    return interpretarPlan(usuarioId, plan);
  } catch (error) {
    registro.warn(
      { usuarioId, err: String(error) },
      "no se pudo resolver el plan; se asume sin plan",
    );
    return { perfil: "registrado", usuarioId, puedeConsumirSaldo: false };
  }
}

export interface ConsumoSaldo {
  /** Registros que costaría: uno por empresa, den igual los campos. */
  registros: number;
  disponiblesAntes: number;
  disponiblesDespues: number;
  alcanza: boolean;
  faltan: number;
}

/**
 * Qué le costaría al saldo descargar el segmento.
 *
 * Un registro por empresa. El número de campos no entra en la cuenta: llevarse
 * cinco columnas cuesta lo mismo que llevarse una.
 */
export function consumoDeSaldo(derechos: Derechos, empresas: number): ConsumoSaldo {
  const disponibles = derechos.registrosDisponibles ?? 0;
  const alcanza = derechos.puedeConsumirSaldo && disponibles >= empresas;
  return {
    registros: empresas,
    disponiblesAntes: disponibles,
    disponiblesDespues: Math.max(0, disponibles - empresas),
    alcanza,
    faltan: Math.max(0, empresas - disponibles),
  };
}
