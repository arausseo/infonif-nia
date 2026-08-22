import { z } from "zod";
import { obtenerDepositosDisponibles } from "../../datos/icif/dato.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

export default definirTool({
  nombre: "consultar_depositos_disponibles",
  descripcion: `De qué ejercicios hay cuentas anuales depositadas para una empresa.

Úsala cuando pregunten de qué años hay cuentas, si están las del último
ejercicio, o antes de ofrecer unas cuentas anuales — así no ofreces un año que
no existe. Necesita el NIF.

Esto dice QUÉ HAY, no lo que ponen: devuelve los años, NO las cifras. Para
ventas, EBITDA o resultado usa obtener_magnitudes; el documento en PDF es un
producto de pago aparte. Y NUNCA deduzcas de aquí cómo le va a la empresa: que
haya depositado o dejado de depositar no es una valoración.`,
  progreso: "Mirando qué cuentas hay",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
    })
    .strict(),

  async ejecutar({ nif }, ctx) {
    const resultado = await obtenerDepositosDisponibles(nif, ctx.derechos.usuarioId, {
      senal: ctx.senal,
    });
    if (resultado.estado !== "ok") return sinDato(resultado, "ninguna cuenta depositada", { usuarioId: ctx.derechos.usuarioId, senal: ctx.senal });

    const { ejercicios, depositos } = resultado.datos;

    return {
      paraElModelo: {
        nif,
        ejercicios,
        depositos: depositos.map((d) => ({
          ejercicio: d.anno,
          // 1 = cuentas del grupo. Es el valor que hay que pasarle luego a
          // descargar_cuentas_anuales, que lo exige.
          consolidado: String(d.consolidado) === "1",
        })),
        ...(ejercicios.length === 0
          ? { aviso: "No consta ninguna cuenta anual depositada para esta empresa." }
          : {}),
      },
    };
  },
});
