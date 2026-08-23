import { z } from "zod";
import { obtenerActosBorme } from "../../datos/icif/dato.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";
import { saldoTrasConsultar } from "./_saldo.js";

export default definirTool({
  nombre: "consultar_actos_borme",
  descripcion: `Movimientos publicados en el BORME de una empresa: nombramientos, ceses, cambios
de domicilio, ampliaciones de capital, disoluciones.

Úsala cuando pregunten si ha cambiado algo, qué se ha movido últimamente, o qué
consta publicado sobre una empresa. Necesita el NIF.

Son hechos publicados, con su fecha. Cuéntalos como tales y NO los interpretes:
una ampliación de capital no significa que a la empresa le vaya bien, ni un cese
que le vaya mal. Si te piden esa lectura, es valoración de riesgo y no la haces.`,
  progreso: "Consultando el BORME",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
      limite: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Cuántos actos devolver, del más reciente al más antiguo"),
    })
    .strict(),

  async ejecutar({ nif, limite }, ctx) {
    const resultado = await obtenerActosBorme(nif, ctx.derechos.usuarioId, {
      senal: ctx.senal,
      ...(ctx.conversacionId ? { conversacionId: ctx.conversacionId } : {}),
    });
    if (resultado.estado !== "ok") return sinDato(resultado, "ningún acto del BORME", { usuarioId: ctx.derechos.usuarioId, senal: ctx.senal });

    const todos = resultado.datos.actos;
    const actos = todos.slice(0, limite ?? 10);

    const { saldo, nota: notaSaldo } = await saldoTrasConsultar(ctx);


    return {
      paraElModelo: {
        ...(saldo ? { creditos: saldo, notaCreditos: notaSaldo } : {}),
        nif,
        actos: actos.map((a) => ({
          fecha: a.fechaborme,
          // Viene clasificado: «Nombramientos.» / «Apoderado:» / el nombre.
          grupo: a.grupo,
          subgrupo: a.subgrupo,
          detalle: a.detalle,
          boe: a.urlficheroborme,
        })),
        ...(todos.length > actos.length
          ? { hayMas: todos.length - actos.length }
          : {}),
        ...(todos.length === 0
          ? { aviso: "No consta ningún acto publicado para esta empresa." }
          : {}),
      },
    };
  },
});
