import { z } from "zod";
import { obtenerRai } from "../../datos/icif/producto.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

export default definirTool({
  nombre: "consultar_rai",
  descripcion: `El RAI de una empresa: si figura en el Registro de Aceptaciones Impagadas.

Úsala cuando pregunten por impagados, por el RAI, o si una empresa tiene efectos
devueltos. Necesita el NIF.

Es un producto que el cliente compra en el portal. Si no lo tiene contratado, la
herramienta lo dice y entonces se le explica qué incluye — no se le da el dato ni
aproximado, porque no lo tienes.

CUIDADO con lo que significa: el RAI dice si constan impagados registrados, y NADA
MÁS. NO es una valoración de solvencia y NO se puede leer como tal. Que no figure
no quiere decir que la empresa esté sana, ni al revés. Si te piden esa lectura,
es scoring y eso lo produce el Informe de Riesgo, nunca tú.`,
  progreso: "Consultando el RAI",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
    })
    .strict(),

  async ejecutar({ nif }, ctx) {
    const resultado = await obtenerRai(nif, ctx.derechos.usuarioId, {
      senal: ctx.senal,
    });

    if (resultado.estado !== "ok") {
      return sinDato(resultado, "la consulta al RAI", {
        ...(ctx.derechos.usuarioId != null ? { usuarioId: ctx.derechos.usuarioId } : {}),
        senal: ctx.senal,
      });
    }

    return {
      paraElModelo: {
        nif,
        rai: resultado.datos,
        recordatorio:
          "Es un hecho registral, no una valoración. Preséntalo tal cual y no lo interpretes como solvencia.",
      },
    };
  },
});
