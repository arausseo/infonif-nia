import { infonif } from "./infonif/cliente.js";
import { PlanBBDD } from "./infonif/tipos.js";

/**
 * Derechos del usuario: qué puede ver sin pagar y qué saldo tiene.
 *
 * ADR-008: esto se consulta **dentro del ejecutor de la herramienta, antes de
 * devolver el dato**. Si no hay derecho, la herramienta devuelve
 * `{ requiereCompra: true, skuSugerido }` y el dato de pago no entra al contexto
 * del modelo. Nunca se le pide al modelo que «no lo mencione».
 *
 * La fuente es su API (`GET /buscador/planBBDD`), no SQL Server: así Nia ve
 * exactamente el mismo saldo que el portal le enseña al usuario en la misma
 * pantalla.
 */

export type Perfil = "anonimo" | "registrado" | "conPlan";

export interface Derechos {
  perfil: Perfil;
  usuarioId?: number;
  /** Registros del plan mensual. `undefined` si no tiene plan. */
  registrosMensuales?: number;
  registrosConsumidos?: number;
  registrosDisponibles?: number;
  /** Puede descargar consumiendo saldo en lugar de pagar. */
  puedeConsumirSaldo: boolean;
}

export const DERECHOS_ANONIMO: Derechos = {
  perfil: "anonimo",
  puedeConsumirSaldo: false,
};

/**
 * Resuelve los derechos de un usuario. Nunca lanza: si su API no responde, se
 * degrada a «registrado sin plan», que es el caso restrictivo. Cobrar de menos
 * por un fallo de red sería peor que pedir que se compre.
 */
export async function resolverDerechos(usuarioId?: number): Promise<Derechos> {
  if (usuarioId === undefined || usuarioId <= 0) return DERECHOS_ANONIMO;

  const base: Derechos = {
    perfil: "registrado",
    usuarioId,
    puedeConsumirSaldo: false,
  };

  try {
    const crudo = await infonif(`/buscador/planBBDD?idusuario=${usuarioId}`, {
      tiempoLimiteMs: 8000,
    });
    const plan = PlanBBDD.parse(crudo);

    if (plan.iD_usuario == null) return base;

    const mensuales = plan.numRegistrosMensuales ?? 0;
    const consumidos = plan.numRegistrosConsumidos ?? 0;
    const disponibles = Math.max(0, mensuales - consumidos);

    return {
      perfil: "conPlan",
      usuarioId,
      registrosMensuales: mensuales,
      registrosConsumidos: consumidos,
      registrosDisponibles: disponibles,
      puedeConsumirSaldo: disponibles > 0,
    };
  } catch {
    return base;
  }
}

/**
 * ¿Alcanza el saldo para descargar el segmento entero?
 *
 * Devuelve también cuánto falta, porque el usuario merece saberlo antes de
 * pulsar, no después.
 */
export function alcanzaElSaldo(
  derechos: Derechos,
  empresas: number,
): { alcanza: boolean; faltan: number } {
  const disponibles = derechos.registrosDisponibles ?? 0;
  return {
    alcanza: derechos.puedeConsumirSaldo && disponibles >= empresas,
    faltan: Math.max(0, empresas - disponibles),
  };
}
