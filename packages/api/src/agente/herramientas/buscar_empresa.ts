import { z } from "zod";
import { buscarEmpresas } from "../../datos/infonif/empresas.js";
import { definirTool } from "../tipos.js";

export default definirTool({
  nombre: "buscar_empresa",
  descripcion: `Localiza empresas por nombre o por NIF. Úsala en cuanto el usuario mencione
una empresa concreta y no sepas su NIF: casi todo lo demás lo necesita.

Devuelve identificación y ubicación, nunca cifras. NO la uses para describir un
mercado o un perfil de cliente: para eso, construir_segmento. Tampoco para
obtener facturación: para eso, obtener_magnitudes.

Si varias empresas se parecen, devuélveselas al usuario y pregúntale cuál es en
lugar de elegir tú.`,
  progreso: "Buscando la empresa",

  esquema: z
    .object({
      consulta: z
        .string()
        .min(3)
        .describe("Nombre, parte del nombre, o NIF completo con su letra"),
    })
    .strict(),

  async ejecutar({ consulta }, ctx) {
    ctx.progreso("Consultando el índice de empresas");
    const { empresas, posiblesMas } = await buscarEmpresas(consulta);

    if (empresas.length === 0) {
      return {
        paraElModelo: {
          encontradas: 0,
          aviso: "Ninguna empresa coincide. Prueba con menos palabras o con el NIF.",
        },
      };
    }

    // Compacto a propósito: esto cuesta tokens en cada vuelta del bucle.
    return {
      paraElModelo: {
        encontradas: empresas.length,
        puedeHaberMas: posiblesMas,
        empresas: empresas.slice(0, 8).map((e) => ({
          nif: e.nif,
          razonSocial: e.razonSocial,
          provincia: e.provincia,
          sector: e.sector,
          ...(e.denominacionesAnteriores.length > 0
            ? { antes: e.denominacionesAnteriores }
            : {}),
        })),
      },
    };
  },
});
