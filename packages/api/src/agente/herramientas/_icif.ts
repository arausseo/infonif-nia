import type { ResultadoIcif } from "../../datos/icif/cliente.js";
import type { ResultadoTool } from "../tipos.js";

/**
 * Qué contarle al modelo cuando el gateway no devuelve datos.
 *
 * Esto es la **regla no negociable 2** aplicada a la familia `/dato`: la
 * comprobación ocurre aquí, en la capa que ya tiene la respuesta, y lo que sube
 * al contexto del modelo es una situación, nunca el dato. Si no hay créditos, el
 * modelo se entera de que no los hay; no se entera de lo que habría visto.
 *
 * Las tres situaciones son distintas y el modelo tiene que poder distinguirlas,
 * porque cada una lleva a una frase distinta:
 *
 * - `sinDatos` — la empresa existe, de esto no hay nada. Es una respuesta.
 * - `sinCreditos` — hay dato, pero hace falta saldo. Es una venta.
 * - `sinClave` — no hay credencial. Es una sesión, no un producto: mandarle a
 *   comprar sería engañarle.
 *
 * Confundir las dos últimas es el error caro: decirle «recarga créditos» a quien
 * en realidad tiene que iniciar sesión le hace pagar por algo que no le va a
 * resolver el problema.
 */
export function sinDato(
  resultado: Exclude<ResultadoIcif<unknown>, { estado: "ok" }>,
  queSeBuscaba: string,
): ResultadoTool {
  if (resultado.estado === "sinDatos") {
    return {
      paraElModelo: {
        hayDatos: false,
        motivo: "sinDatos",
        aviso: `De esta empresa no consta ${queSeBuscaba}. Es una respuesta válida: díselo con naturalidad y no lo intentes otra vez.`,
      },
    };
  }

  if (resultado.estado === "sinCreditos") {
    return {
      paraElModelo: {
        hayDatos: false,
        motivo: "sinCreditos",
        requiereCompra: true,
        // El importe va aquí porque la vez que no estuvo, el modelo se lo
        // inventó. Un hueco en el resultado de una herramienta lo rellena el
        // modelo, y lo rellena mal.
        skuSugerido: "PLAN_BBDD",
        aviso: `Se han agotado los créditos de consulta. Explícale que ${queSeBuscaba} está disponible pero necesita saldo, y ofrécele recargar en la página de planes. No des el dato ni lo aproximes: no lo tienes.`,
      },
    };
  }

  return {
    paraElModelo: {
      hayDatos: false,
      motivo: "sinCredencial",
      // Sin requiereCompra a propósito: esto NO se arregla comprando.
      aviso: `No hay credencial para consultar ${queSeBuscaba}. Si el usuario no ha iniciado sesión, dile que entre en su cuenta. NO le ofrezcas comprar nada: el problema no es de saldo.`,
    },
  };
}
