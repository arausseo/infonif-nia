import { leerAutorizacion, recordarSaldo } from "../../datos/icif/autorizacion.js";
import { consultarCreditos } from "../../datos/icif/credito.js";
import type { ContextoTool } from "../tipos.js";

/**
 * El recuento de créditos que acompaña a una consulta.
 *
 * Quien gasta el saldo tiene derecho a saber cuánto le queda **en el momento de
 * gastarlo**, no cuando se le ocurra preguntar. Por eso esto va pegado al
 * resultado de la herramienta y no en una herramienta aparte: un saldo que hay
 * que ir a buscar es un saldo que nadie mira.
 *
 * Se puede apagar. Alguien que abre veinte empresas seguidas no quiere veinte
 * recordatorios de cuánto le queda, y repetirlo tapa la respuesta.
 * `autorizar_consultas` con `informar: false` lo silencia.
 *
 * **Preguntar el saldo no gasta saldo**: `consultar-creditos` no pasa por el
 * control de créditos, comprobado contra el API con una clave a cero que
 * responde 200. Si costara, esto no se haría.
 *
 * ## Cómo se sabe lo que ha costado
 *
 * El gateway no lo dice. Cobra 1 crédito la primera vez que se abre una empresa
 * en el mes y nada las siguientes, pero responde igual en los dos casos.
 *
 * Así que se resta contra el último saldo conocido. La primera consulta de una
 * conversación no tiene con qué comparar y solo informa del disponible; a partir
 * de ahí, el gasto es exacto. Es mejor que suponer: decirle a alguien que ha
 * gastado un crédito cuando no ha gastado ninguno mina la confianza en todo lo
 * demás que le cuentes.
 */
export interface Saldo {
  /** Lo que ha costado esta consulta. `undefined` si no había con qué comparar. */
  gastados?: number;
  disponibles: number;
}

export async function saldoTrasConsultar(
  ctx: ContextoTool,
): Promise<{ saldo?: Saldo; nota?: string }> {
  const autorizacion = await leerAutorizacion(ctx.conversacionId);
  if (!autorizacion.informar) return {};

  const consulta = await consultarCreditos(ctx.derechos.usuarioId, {
    senal: ctx.senal,
  });
  if (consulta.estado !== "ok") return {};

  const disponibles = consulta.datos.disponibles;
  const anterior = autorizacion.ultimoSaldo;
  await recordarSaldo(ctx.conversacionId, disponibles);

  if (anterior == null) {
    return {
      saldo: { disponibles },
      nota: "Dile cuántos créditos le quedan, en una línea y sin dramatismo.",
    };
  }

  const gastados = Math.max(0, anterior - disponibles);
  return {
    saldo: { gastados, disponibles },
    nota:
      gastados === 0
        ? "Esta empresa ya estaba consultada este mes: NO ha gastado nada. Si lo mencionas, dilo así."
        : "Dile cuánto ha gastado y cuánto le queda, en una línea y sin dramatismo.",
  };
}
