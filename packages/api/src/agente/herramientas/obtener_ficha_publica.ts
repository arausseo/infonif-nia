import { z } from "zod";
import { obtenerFicha } from "../../datos/fichas.js";
import { definirTool } from "../tipos.js";

export default definirTool({
  nombre: "obtener_ficha_publica",
  descripcion: `Datos de identificación de una empresa: actividad, sector, domicilio, fecha de
constitución y de qué ejercicios hay cuentas depositadas.

Es gratuita y no incluye ninguna cifra. NO la uses si lo que quieres son ventas,
resultado o empleados: eso es obtener_magnitudes, que comprueba los derechos.

Dice qué ejercicios existen, que es útil para preguntar al usuario por cuál se
interesa antes de gastar nada.`,
  progreso: "Consultando la ficha pública",

  esquema: z
    .object({
      nif: z.string().min(8).describe("NIF de la empresa, con su letra inicial"),
    })
    .strict(),

  async ejecutar({ nif }, ctx) {
    ctx.progreso("Leyendo la ficha");
    const resultado = await obtenerFicha(nif, ctx.derechos, { conMagnitudes: false });

    if (!resultado.encontrada) {
      return { paraElModelo: { encontrada: false, nif } };
    }

    return {
      paraElModelo: { encontrada: true, ...resultado.publica },
      paraLaUI: { tipo: "ficha", datos: { ...resultado.publica } },
    };
  },
});
