import { z } from "zod";
import { obtenerEmpresasGrupo } from "../../datos/icif/dato.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

export default definirTool({
  nombre: "consultar_empresas_grupo",
  descripcion: `Empresas vinculadas a una dada: matriz, filiales y participadas, con la relación
que las une.

Úsala cuando pregunten de quién depende una empresa, quién es su matriz, qué
filiales tiene o si forma parte de un grupo. Necesita el NIF.

Las empresas que devuelve son otras empresas: si el usuario quiere datos de
alguna, hay que consultarla por su propio NIF.

NO la uses para listar empresas de un sector o una zona — eso es
construir_segmento. Aquí solo salen las vinculadas por participación societaria
a una empresa concreta, que es otra cosa.`,
  progreso: "Buscando el grupo",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
    })
    .strict(),

  async ejecutar({ nif }, ctx) {
    const resultado = await obtenerEmpresasGrupo(nif, ctx.derechos.usuarioId, {
      senal: ctx.senal,
    });
    if (resultado.estado !== "ok") return sinDato(resultado, "ninguna vinculación");

    const { empresas } = resultado.datos;

    return {
      paraElModelo: {
        nif,
        empresas: empresas.map((e) => ({
          nif: e.nif,
          razonSocial: e.razonsocial,
          relacion: e.relacion,
          participacion: e.participacion,
        })),
        ...(empresas.length === 0
          ? { aviso: "No consta que esta empresa pertenezca a ningún grupo." }
          : {}),
      },
    };
  },
});
