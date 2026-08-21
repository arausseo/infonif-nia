import { z } from "zod";
import { consultarConsumoDelMes, consultarCreditos } from "../../datos/icif/credito.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

export default definirTool({
  nombre: "consultar_creditos",
  descripcion: `Cuántos créditos de consulta le quedan al usuario, y qué empresas ha consultado
este mes.

Estos créditos son los que se gastan al mirar datos de una empresa concreta:
cargos, BORME, grupo o cuentas depositadas. Se gasta uno por empresa y por mes,
así que volver sobre una empresa ya consultada este mes no cuesta nada.

**NO los confundas con los registros del plan de Base de Datos**, que es lo que
devuelve consultar_saldo. Son dos monedas distintas que no se convierten entre
sí: los registros sirven para descargar listados segmentados, estos créditos
para consultar empresas. Tener de sobra en una no ayuda en nada con la otra, y
mandar a recargar donde no es le hace perder el viaje al usuario.

Úsala si preguntan cuánto saldo les queda para consultas, si han gastado mucho
este mes, o antes de decirles que algo no se puede consultar.`,
  progreso: "Consultando el saldo",

  esquema: z
    .object({
      incluirConsumo: z
        .boolean()
        .optional()
        .describe("Añadir las empresas consultadas este mes"),
    })
    .strict(),

  async ejecutar({ incluirConsumo }, ctx) {
    const saldo = await consultarCreditos(ctx.derechos.usuarioId, { senal: ctx.senal });
    if (saldo.estado !== "ok") {
      return sinDato(saldo, "el saldo de créditos", {
        ...(ctx.derechos.usuarioId != null ? { usuarioId: ctx.derechos.usuarioId } : {}),
        senal: ctx.senal,
      });
    }

    const { disponibles } = saldo.datos;

    if (!incluirConsumo) {
      return {
        paraElModelo: {
          creditosDisponibles: disponibles,
          moneda: "creditos_consulta",
          nota: "Son créditos de consulta de empresa, NO los registros del plan de listados.",
        },
      };
    }

    ctx.progreso("Mirando el consumo del mes");
    const ahora = new Date();
    const consumo = await consultarConsumoDelMes(
      ahora.getFullYear(),
      ahora.getMonth() + 1,
      ctx.derechos.usuarioId,
      { senal: ctx.senal },
    );

    return {
      paraElModelo: {
        creditosDisponibles: disponibles,
        moneda: "creditos_consulta",
        nota: "Son créditos de consulta de empresa, NO los registros del plan de listados.",
        ...(consumo.estado === "ok"
          ? {
              consumoDelMes: {
                empresasConsultadas: consumo.datos.empresas.length,
                // Solo las cinco primeras: el aviso legal limita la vista previa
                // y aquí tampoco aporta enumerarlas todas.
                ejemplos: consumo.datos.empresas.slice(0, 5).map((e) => e.nif),
                hayMas: consumo.datos.hayMas,
              },
            }
          : {}),
      },
    };
  },
});
