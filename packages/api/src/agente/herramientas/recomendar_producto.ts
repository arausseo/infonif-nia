import { z } from "zod";
import { recomendarProducto } from "../../datos/semantica.js";
import { definirTool } from "../tipos.js";

export default definirTool({
  nombre: "recomendar_producto",
  descripcion: `Dada la situación que cuenta el usuario, dice qué producto de Infonif le
corresponde y por qué.

Úsala en cuanto el usuario describa una necesidad de negocio en lugar de pedir un
dato concreto: «un cliente me pide crédito», «quiero prospectar», «tengo que
elegir proveedor».

Es especialmente importante cuando pregunte por riesgo, solvencia o crédito: la
herramienta devuelve el Informe de Riesgo, que es el producto que emite esa
valoración. Tú no la emites nunca.

Repítele al usuario el «porQue» que devuelve, no te inventes otro argumento.`,
  progreso: "Buscando el producto adecuado",

  esquema: z
    .object({
      situacion: z
        .string()
        .min(5)
        .describe("Lo que necesita el usuario, con sus palabras"),
    })
    .strict(),

  async ejecutar({ situacion }, ctx) {
    ctx.progreso("Comparando con casos conocidos");
    const recomendados = await recomendarProducto(situacion, 2);

    if (recomendados.length === 0) {
      return {
        paraElModelo: {
          productos: [],
          aviso:
            "Ningún caso conocido encaja. Pregúntale al usuario qué necesita exactamente en vez de proponerle algo al azar.",
        },
      };
    }

    return {
      paraElModelo: {
        productos: recomendados.map((r) => ({
          sku: r.sku,
          porQue: r.porQue,
          ...(r.alternativa
            ? { alternativa: r.alternativa, porQueAlternativa: r.porQueAlternativa }
            : {}),
        })),
      },
    };
  },
});
