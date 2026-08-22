import { z } from "zod";
import { obtenerSocios } from "../../datos/icif/producto.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

export default definirTool({
  nombre: "consultar_socios",
  descripcion: `Los socios de una sociedad y su participación.

Úsala cuando pregunten por los socios, el accionariado o quién posee una empresa.
Necesita el NIF.

NO la confundas con dos cosas parecidas: consultar_cargos son los administradores
—quien la gestiona, que no siempre es quien la posee— y consultar_empresas_grupo
son las sociedades vinculadas. Si preguntan por el titular real en sentido legal,
esa es consultar_titularidad_real.

Entre los socios puede haber personas físicas. Preséntalos como dato registral,
sin juicios, y NO los uses para construir el perfil de nadie.

Que no consten socios es una respuesta válida: en una sociedad no cotizada puede
sencillamente no estar publicado.`,
  progreso: "Consultando el accionariado",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la sociedad"),
    })
    .strict(),

  async ejecutar({ nif }, ctx) {
    const usuarioId = ctx.derechos.usuarioId;
    const resultado = await obtenerSocios(nif, usuarioId, { senal: ctx.senal });

    if (resultado.estado !== "ok") {
      return sinDato(resultado, "el accionariado", {
        ...(usuarioId != null ? { usuarioId } : {}),
        senal: ctx.senal,
      });
    }

    return {
      paraElModelo: {
        nif,
        socios: resultado.datos,
        recordatorio:
          "Dato registral. Si aparecen personas físicas, preséntalas sin valorarlas.",
      },
    };
  },
});
