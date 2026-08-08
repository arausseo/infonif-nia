import { z } from "zod";
import { resolverActividad } from "../../datos/semantica.js";
import { definirTool } from "../tipos.js";

export default definirTool({
  nombre: "resolver_actividad",
  descripcion: `Traduce una actividad dicha en lenguaje corriente —«logística», «bodegas»,
«talleres»— a códigos CNAE, con cuántas empresas hay en cada uno.

Úsala SIEMPRE antes de construir_segmento cuando el usuario describa un sector.
NO te inventes códigos CNAE por tu cuenta bajo ningún concepto: un código
equivocado cuenta empresas que no son y acaba en una factura mal emitida.

Si los códigos que devuelve no encajan del todo con lo que pedía el usuario,
enséñaselos y pregúntale antes de contar.`,
  progreso: "Interpretando la actividad",

  esquema: z
    .object({
      actividad: z.string().min(3).describe("La actividad tal como la dijo el usuario"),
      limite: z.number().int().min(1).max(10).optional(),
    })
    .strict(),

  async ejecutar({ actividad, limite }, ctx) {
    ctx.progreso("Buscando en el catálogo CNAE");
    const resolucion = await resolverActividad(actividad, limite ?? 5);

    if (resolucion.actividades.length === 0) {
      return {
        paraElModelo: {
          actividades: [],
          aviso:
            "Ninguna actividad del CNAE encaja con eso. Pídele al usuario que lo diga de otra forma.",
        },
      };
    }

    return {
      paraElModelo: {
        actividades: resolucion.actividades.map((a) => ({
          cnae: a.cnae,
          descripcion: a.descripcion,
          empresas: a.empresas,
        })),
      },
    };
  },
});
