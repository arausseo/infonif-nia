import { z } from "zod";
import { obtenerDepositoPdf } from "../../datos/icif/producto.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

export default definirTool({
  nombre: "descargar_cuentas_anuales",
  descripcion: `Las cuentas anuales depositadas de una empresa en un ejercicio concreto.

Úsala cuando pidan las cuentas, el depósito o el balance de un año. Necesita el
NIF y el ejercicio.

ANTES de llamarla, usa consultar_depositos_disponibles para saber de qué años hay
cuentas. Pedir un ejercicio que no existe es un viaje en balde, y esa comprobación
no cuesta nada si ya has abierto esa empresa.

Por defecto son las cuentas INDIVIDUALES. Pide consolidado solo si preguntan
expresamente por las del grupo.

Es un producto que se compra en el portal. Si el usuario no lo tiene contratado,
la herramienta lo dice; entonces explícale qué incluye y no des ninguna cifra.

NO la uses para dar magnitudes sueltas —ventas, EBITDA, resultado—: para eso está
obtener_magnitudes, que no requiere compra.`,
  progreso: "Buscando las cuentas anuales",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
      ejercicio: z
        .string()
        .regex(/^\d{4}$/)
        .describe("Año del ejercicio, cuatro cifras"),
      consolidado: z
        .boolean()
        .optional()
        .describe("Cuentas del grupo. Por defecto false: las individuales"),
    })
    .strict(),

  async ejecutar({ nif, ejercicio, consolidado }, ctx) {
    const resultado = await obtenerDepositoPdf(
      { nif, ejercicio, ...(consolidado != null ? { consolidado } : {}) },
      ctx.derechos.usuarioId,
      { senal: ctx.senal },
    );

    if (resultado.estado !== "ok") {
      return sinDato(resultado, `las cuentas de ${ejercicio}`, {
        ...(ctx.derechos.usuarioId != null ? { usuarioId: ctx.derechos.usuarioId } : {}),
        senal: ctx.senal,
      });
    }

    return {
      paraElModelo: {
        nif,
        ejercicio,
        consolidado: consolidado ?? false,
        deposito: resultado.datos,
      },
    };
  },
});
