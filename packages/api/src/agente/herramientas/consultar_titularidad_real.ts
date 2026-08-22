import { z } from "zod";
import {
  obtenerDeclaracionTitularidadReal,
  obtenerTitularidadReal,
} from "../../datos/icif/producto.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

export default definirTool({
  nombre: "consultar_titularidad_real",
  descripcion: `Quién es el titular real de una sociedad: las personas físicas que en última
instancia la controlan, normalmente por encima del 25 % del capital.

Úsala SOLO si te lo piden explícitamente —«quién está detrás», «quién controla»,
«titularidad real», «beneficiario último»—. Necesita el NIF.

NO la llames por tu cuenta para completar el retrato de una empresa. Aquí no
estás consultando un CNAE: son datos de personas físicas, y el registro existe
para prevención de blanqueo, no para hacer perfiles. Si nadie ha preguntado, no
se consulta.

Va de sociedad a personas y NUNCA al revés: no sirve para averiguar en qué
empresas participa alguien, y no hay forma de hacerlo.

Preséntalo como lo que es —un dato registral, con su porcentaje— sin añadir
juicios sobre las personas que aparezcan. Y si no está contratado, dilo y no des
el dato.`,
  progreso: "Consultando titularidad real",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la sociedad"),
      declaracion: z
        .boolean()
        .optional()
        .describe("La declaración formal del RETIR en vez del dato suelto"),
    })
    .strict(),

  async ejecutar({ nif, declaracion }, ctx) {
    const usuarioId = ctx.derechos.usuarioId;
    const resultado = declaracion
      ? await obtenerDeclaracionTitularidadReal(nif, usuarioId, { senal: ctx.senal })
      : await obtenerTitularidadReal(nif, usuarioId, { senal: ctx.senal });

    if (resultado.estado !== "ok") {
      return sinDato(resultado, "la titularidad real", {
        ...(usuarioId != null ? { usuarioId } : {}),
        senal: ctx.senal,
      });
    }

    return {
      paraElModelo: {
        nif,
        titularidadReal: resultado.datos,
        recordatorio:
          "Son datos registrales de personas físicas. Preséntalos tal cual, sin valorarlos y sin cruzarlos con nada.",
      },
    };
  },
});
