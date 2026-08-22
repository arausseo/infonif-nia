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

Devuelve los cargos VIGENTES. Su API no sabe dar los históricos, así que si
preguntan por quién estuvo antes, dilo con naturalidad en vez de intentarlo.

Que una empresa no tenga cargos publicados es un resultado válido, no un fallo:
significa que en el registro no consta ninguno.

NO la uses al revés: no sirve para averiguar en qué empresas está una persona.
Va de una empresa a sus cargos, nunca de un nombre a sus empresas. Y NUNCA la
uses para varias empresas de un segmento: es de una en una.`,
  progreso: "Consultando cargos",

  esquema: z
    .object({
      nif: z.string().min(8).max(12).describe("NIF de la empresa"),
    })
    .strict(),

  async ejecutar({ nif }, ctx) {
    const resultado = await obtenerCargos(nif, ctx.derechos.usuarioId, {
      senal: ctx.senal,
    });
    if (resultado.estado !== "ok") return sinDato(resultado, "los cargos", { usuarioId: ctx.derechos.usuarioId, senal: ctx.senal });

    const { cargos } = resultado.datos;

    return {
      paraElModelo: {
        nif,
        cargos: cargos.map((c) => ({
          nombre: c.nombre,
          cargo: c.cargo,
          estado: c.estado,
          desde: c.fechanombramiento,
          hasta: c.fechacese,
          // `vinculaciones` NO se expone a propósito: dice en cuántas sociedades
          // más figura esa persona, y eso es tirar del hilo de alguien.
        })),
        ...(cargos.length === 0
          ? { aviso: "En el registro no consta ningún cargo para esta empresa." }
          : {}),
      },
    };
  },
});
