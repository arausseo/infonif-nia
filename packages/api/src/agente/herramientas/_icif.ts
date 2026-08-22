import type { ResultadoIcif } from "../../datos/icif/cliente.js";
import { consultarCreditos } from "../../datos/icif/credito.js";
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
export async function sinDato(
  resultado: Exclude<ResultadoIcif<unknown>, { estado: "ok" }>,
  queSeBuscaba: string,
  ctx?: { usuarioId?: number; senal?: AbortSignal },
): Promise<ResultadoTool> {
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
    // Se pregunta el saldo exacto. `/credito/consultar-creditos` NO pasa por el
    // control de créditos —comprobado con una clave a cero, responde 200— así
    // que preguntarlo aquí no cuesta nada y convierte «no hay saldo» en «te
    // quedan 0». La diferencia importa: con un número el usuario sabe si le
    // faltan tres o trescientos.
    const saldo = await consultarCreditos(ctx?.usuarioId, ctx?.senal ? { senal: ctx.senal } : {});
    const disponibles = saldo.estado === "ok" ? saldo.datos.disponibles : undefined;

    return {
      paraElModelo: {
        hayDatos: false,
        motivo: "sinCreditos",
        requiereCompra: true,
        ...(disponibles != null ? { creditosDisponibles: disponibles } : {}),
        // Moneda distinta del plan de registros. Sin esto el modelo mezcla las
        // dos y manda a recargar donde no es.
        moneda: "creditos_consulta",
        aviso: `Se han agotado los créditos de consulta${disponibles != null ? ` (quedan ${disponibles})` : ""}. Explícale que ${queSeBuscaba} está disponible pero necesita saldo. OJO: estos créditos NO son los registros del plan de Base de Datos, son otra cosa y se compran aparte. No des el dato ni lo aproximes: no lo tienes.`,
      },
    };
  }

  if (resultado.estado === "noAutorizado") {
    return {
      paraElModelo: {
        hayDatos: false,
        motivo: "noContratado",
        requiereCompra: true,
        // Moneda distinta otra vez: esto no son créditos de consulta ni
        // registros de plan. Es un producto que se compra suelto en la web.
        moneda: "producto",
        aviso: `Ese producto no está contratado para este usuario, así que no tienes ${queSeBuscaba}. Explícale qué incluye y dile que puede adquirirlo en el portal. OJO: no es cuestión de créditos ni de registros del plan, es una compra aparte. Y no des el dato: no lo tienes.`,
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
