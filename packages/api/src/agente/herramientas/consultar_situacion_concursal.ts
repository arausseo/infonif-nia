import { z } from "zod";
import { obtenerSituacionConcursal } from "../../datos/icif/producto.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

export default definirTool({
  nombre: "consultar_situacion_concursal",
  descripcion: `La situación concursal de una empresa: si consta concurso de acreedores u otro
procedimiento del Registro Público Concursal.

Úsala cuando pregunten si está en concurso, si hay procedimiento concursal, o
por la situación concursal de un NIF. Necesita el NIF.

Es un producto que el cliente compra en el portal. Si no lo tiene contratado, la
herramienta lo dice y entonces se le explica qué incluye — no se le da el dato ni
aproximado, porque no lo tienes.

NO la confundas con el RAI: el RAI son impagados registrados, no un concurso.
Y NUNCA la leas como valoración de solvencia: que no conste concurso no quiere
decir que la empresa esté sana. Si te piden esa lectura, es scoring y eso lo
produce el Informe de Riesgo, nunca tú.`,
  progreso: "Consultando la situación concursal",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
    })
    .strict(),

  async ejecutar({ nif }, ctx) {
    const resultado = await obtenerSituacionConcursal(nif, ctx.derechos.usuarioId, {
      senal: ctx.senal,
    });

    if (resultado.estado !== "ok") {
      return sinDato(resultado, "la situación concursal", {
        ...(ctx.derechos.usuarioId != null ? { usuarioId: ctx.derechos.usuarioId } : {}),
        senal: ctx.senal,
      });
    }

    return {
      paraElModelo: {
        nif,
        situacionConcursal: resultado.datos,
        recordatorio:
          "Es un hecho registral, no una valoración. Preséntalo tal cual y no lo interpretes como solvencia.",
      },
    };
  },
});
