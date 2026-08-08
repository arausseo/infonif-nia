import { z } from "zod";
import { obtenerFicha } from "../../datos/fichas.js";
import { definirTool } from "../tipos.js";

export default definirTool({
  nombre: "comparar_empresas",
  descripcion: `Pone las magnitudes de varias empresas una al lado de otra, del mismo ejercicio.

Requiere derechos, igual que obtener_magnitudes. Si el usuario no los tiene,
devuelve requiereCompra y no devuelve ninguna cifra.

Compara solo lo que te dé la herramienta. NO deduzcas cuál es «mejor» ni cuál es
«más solvente»: eso es una valoración y no te corresponde.`,
  progreso: "Comparando empresas",

  esquema: z
    .object({
      nifs: z.array(z.string().min(8)).min(2).max(5).describe("NIF de cada empresa"),
      ejercicio: z.number().int().min(1990).max(2100).optional(),
    })
    .strict(),

  async ejecutar({ nifs, ejercicio }, ctx) {
    ctx.progreso("Comprobando los derechos de acceso");

    const opciones: { conMagnitudes: boolean; ejercicio?: number } = {
      conMagnitudes: true,
    };
    if (ejercicio !== undefined) opciones.ejercicio = ejercicio;

    const fichas = await Promise.all(
      nifs.map(async (nif) => ({
        nif,
        ficha: await obtenerFicha(nif, ctx.derechos, opciones),
      })),
    );

    const bloqueada = fichas.find(
      (f) => f.ficha.encontrada && f.ficha.requiereCompra !== undefined,
    );
    if (bloqueada?.ficha.encontrada && bloqueada.ficha.requiereCompra) {
      ctx.progreso("Sin acceso a las cifras", { detalle: "requiere compra" });
      return {
        paraElModelo: {
          requiereCompra: true,
          skuSugerido: bloqueada.ficha.requiereCompra.skuSugerido,
          motivo: bloqueada.ficha.requiereCompra.motivo,
        },
        paraLaUI: {
          tipo: "bloqueado",
          datos: {
            skuSugerido: bloqueada.ficha.requiereCompra.skuSugerido,
            motivo: bloqueada.ficha.requiereCompra.motivo,
          },
        },
      };
    }

    ctx.progreso("Alineando ejercicios");

    const comparadas = fichas
      .filter((f) => f.ficha.encontrada)
      .map((f) => {
        const ficha = f.ficha as Extract<typeof f.ficha, { encontrada: true }>;
        return {
          nif: ficha.publica.nif,
          razonSocial: ficha.publica.razonSocial,
          actividad: ficha.publica.actividad,
          magnitudes: ficha.magnitudes,
        };
      });

    const noEncontradas = fichas.filter((f) => !f.ficha.encontrada).map((f) => f.nif);

    return {
      paraElModelo: {
        empresas: comparadas,
        ...(noEncontradas.length > 0 ? { noEncontradas } : {}),
        nota: "Cada cifra lleva su ejercicio. Si dos empresas tienen ejercicios distintos, dilo en vez de compararlas como si fueran el mismo año.",
      },
      paraLaUI: { tipo: "ficha", datos: { comparacion: comparadas } },
    };
  },
});
