import { z } from "zod";
import { FiltroSegmento } from "../../datos/infonif/filtros.js";
import { contarSegmento } from "../../datos/infonif/segmentos.js";
import {
  calcularCoste,
  catalogoParaElModelo,
  recomendarPlan,
} from "../../datos/precios.js";
import { definirTool } from "../tipos.js";

export default definirTool({
  nombre: "cotizar",
  descripcion: `Calcula el precio exacto de un listado con los campos que el usuario quiera, y
dice si le compensa un plan de registros.

El precio no es una estimación: cada campo se cobra por los registros que
REALMENTE lo traen, y eso lo dice la base de datos. NO calcules precios tú.

Un plan solo compensa por volumen o por uso repetido. Si el listado suelto sale
más barato, dilo: la herramienta ya lo indica en «compensa».

Los campos se piden por su nombre corriente: «EBITDA», «Ventas», «Email»,
«Razón social», «Resultado del ejercicio». Si alguno no existe, la herramienta
devuelve el catálogo entero en «catalogo»: mira ahí y vuelve a pedirlo bien.
**NUNCA le digas al usuario que un campo no existe sin haber visto ese
catálogo**, porque casi siempre existe con otro nombre.`,
  progreso: "Calculando el precio",

  esquema: z
    .object({
      filtro: FiltroSegmento.describe("Los mismos criterios del segmento"),
      campos: z
        .array(z.string())
        .min(1)
        .max(34)
        .describe(
          "Campos por su nombre corriente: EBITDA, Ventas, Email, Razón social, Teléfono…",
        ),
    })
    .strict(),

  async ejecutar({ filtro, campos }, ctx) {
    ctx.progreso("Contando el segmento");
    const segmento = await contarSegmento(filtro);

    ctx.progreso("Aplicando el precio de cada campo");
    const coste = calcularCoste(
      ctx.derechos,
      segmento.cantidad,
      campos,
      segmento.camposDisponibles,
    );

    const plan =
      coste.formaDePago === "euros"
        ? recomendarPlan(segmento.cantidad, coste.enEuros.total)
        : undefined;

    return {
      paraElModelo: {
        empresas: segmento.cantidad,
        forma: coste.formaDePago,
        ...(coste.formaDePago === "saldo"
          ? {
              registros: coste.enSaldo.registros,
              alcanza: coste.enSaldo.alcanza,
              faltan: coste.enSaldo.faltan,
            }
          : {
              base: coste.enEuros.baseImponible,
              iva: coste.enEuros.iva,
              total: coste.enEuros.total,
              lineas: coste.enEuros.lineas.map((l) => ({
                campo: l.etiqueta,
                registros: l.registros,
                importe: l.importe,
              })),
            }),
        ...(coste.enEuros.camposSinDato.length > 0
          ? {
              camposDesconocidos: coste.enEuros.camposSinDato,
              // Con etiquetas, no solo códigos: es lo que le permite corregirse
              // en vez de decirle al usuario que el campo no existe.
              catalogo: catalogoParaElModelo(),
            }
          : {}),
        ...(plan
          ? {
              plan: {
                sku: plan.tramo.sku,
                registros: plan.tramo.registros,
                coste: plan.coste,
                compensa: plan.mereceLaPenaParaEsteListado,
              },
            }
          : {}),
      },
      paraLaUI: {
        tipo: "segmento",
        clave: "segmento",
        datos: { empresas: segmento.cantidad, coste, plan },
      },
    };
  },
});
