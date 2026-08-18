import { z } from "zod";
import { obtenerCargos } from "../../datos/icif/dato.js";
import { definirTool } from "../tipos.js";
import { sinDato } from "./_icif.js";

export default definirTool({
  nombre: "consultar_cargos",
  descripcion: `Quién administra o representa a una empresa: administradores, apoderados y
consejeros, con su cargo y desde cuándo.

Úsala cuando pregunten quién manda, quién firma, quién administra o quién
representa a una empresa concreta. Necesita el NIF: si solo tienes el nombre,
primero buscar_empresa.

Por defecto devuelve los cargos VIGENTES, que es lo que casi siempre se quiere.
Pide estado "todos" solo si preguntan explícitamente por cargos históricos o por
quién estuvo antes.

Que una empresa no tenga cargos publicados es un resultado válido, no un fallo:
significa que en el registro no consta ninguno.

NO la uses al revés: no sirve para averiguar en qué empresas está una persona.
Va de una empresa a sus cargos, nunca de un nombre a sus empresas. Y NUNCA la
uses para varias empresas de un segmento: es de una en una.`,
  progreso: "Consultando cargos",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
      estado: z
        .enum(["vigentes", "todos"])
        .optional()
        .describe("vigentes por defecto; todos solo si piden histórico"),
    })
    .strict(),

  async ejecutar({ nif, estado }, ctx) {
    const opciones: { estado?: "vigentes" | "todos"; senal: AbortSignal } = {
      senal: ctx.senal,
    };
    if (estado) opciones.estado = estado;

    const resultado = await obtenerCargos(nif, ctx.derechos.usuarioId, opciones);
    if (resultado.estado !== "ok") return sinDato(resultado, "los cargos");

    const { cargos } = resultado.datos;

    return {
      paraElModelo: {
        nif,
        estado: resultado.datos.estado,
        cargos: cargos.map((c) => ({
          nombre: c.nombre,
          cargo: c.cargo,
          desde: c.fechanombramiento,
          hasta: c.fechacese,
        })),
        ...(cargos.length === 0
          ? { aviso: "En el registro no consta ningún cargo para esta empresa." }
          : {}),
      },
    };
  },
});
