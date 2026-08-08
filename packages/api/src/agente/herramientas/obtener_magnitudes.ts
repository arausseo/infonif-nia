import { z } from "zod";
import { obtenerFicha } from "../../datos/fichas.js";
import { definirTool } from "../tipos.js";

/**
 * Aquí se cumple la regla 2 / ADR-008.
 *
 * La verificación de derechos ocurre **dentro de `obtenerFicha`, antes de que el
 * dato exista en esta función**. Si no hay derecho, aquí no llega ninguna cifra
 * que ocultar: llega un `requiereCompra` y ya está. No hay ninguna rama en la
 * que el dato de pago entre al contexto del modelo.
 */
export default definirTool({
  nombre: "obtener_magnitudes",
  descripcion: `Cifras financieras de una empresa: ventas, EBITDA, resultado, activo, patrimonio
neto y empleados, cada una con el ejercicio al que corresponde.

Requiere derechos. Si el usuario no los tiene, devuelve requiereCompra con el
producto que se los daría: entonces explícale qué incluye ese producto y ofrécele
comprarlo. NO inventes ni estimes ninguna cifra, y no repitas cifras de turnos
anteriores como si fueran nuevas.

Cita SIEMPRE el ejercicio junto a cada número. Una cifra sin año no vale.`,
  progreso: "Consultando las magnitudes",

  esquema: z
    .object({
      nif: z.string().min(8).describe("NIF de la empresa, con su letra inicial"),
      ejercicio: z
        .number()
        .int()
        .min(1990)
        .max(2100)
        .optional()
        .describe("Año concreto. Si se omite, el último con cuentas depositadas"),
    })
    .strict(),

  async ejecutar({ nif, ejercicio }, ctx) {
    ctx.progreso("Comprobando los derechos de acceso");

    const opciones: { conMagnitudes: boolean; ejercicio?: number } = {
      conMagnitudes: true,
    };
    if (ejercicio !== undefined) opciones.ejercicio = ejercicio;

    const resultado = await obtenerFicha(nif, ctx.derechos, opciones);

    if (!resultado.encontrada) {
      return { paraElModelo: { encontrada: false, nif } };
    }

    if (resultado.requiereCompra) {
      ctx.progreso("Sin acceso a las cifras", { detalle: "requiere compra" });
      return {
        paraElModelo: {
          encontrada: true,
          razonSocial: resultado.publica.razonSocial,
          requiereCompra: true,
          skuSugerido: resultado.requiereCompra.skuSugerido,
          producto: resultado.requiereCompra.nombre,
          precio: resultado.requiereCompra.precio,
          motivo: resultado.requiereCompra.motivo,
          ejerciciosDisponibles: resultado.publica.ejerciciosDisponibles,
        },
        paraLaUI: {
          tipo: "bloqueado",
          datos: {
            razonSocial: resultado.publica.razonSocial,
            nif: resultado.publica.nif,
            skuSugerido: resultado.requiereCompra.skuSugerido,
            producto: resultado.requiereCompra.nombre,
            precio: resultado.requiereCompra.precio,
            motivo: resultado.requiereCompra.motivo,
          },
        },
      };
    }

    ctx.progreso("Cifras obtenidas");
    return {
      paraElModelo: {
        encontrada: true,
        razonSocial: resultado.publica.razonSocial,
        nif: resultado.publica.nif,
        magnitudes: resultado.magnitudes,
        ejerciciosDisponibles: resultado.publica.ejerciciosDisponibles,
      },
      paraLaUI: {
        tipo: "ficha",
        datos: {
          ...resultado.publica,
          magnitudes: resultado.magnitudes,
          contacto: resultado.contacto,
        },
      },
    };
  },
});
