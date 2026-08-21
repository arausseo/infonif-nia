import { z } from "zod";
import { icif, type ResultadoIcif } from "./cliente.js";

/**
 * Familia `/credito` del gateway: el saldo con el que se pagan los datos y
 * productos de una empresa.
 *
 * **Cuidado con confundir esto con el plan de registros.** Son dos monedas
 * distintas que no se convierten entre sí, y el usuario las llama «créditos» a
 * las dos:
 *
 * | | plan de registros (`consultar_saldo`) | créditos icif (esto) |
 * |---|---|---|
 * | Para qué | descargar listados segmentados | datos y productos de UNA empresa |
 * | Se gasta | 1 por empresa del listado | 1 por empresa consultada y mes |
 * | Fuente | `bbdd-api` `/buscador/planBBDD` | gateway `/credito/*` |
 * | Dónde se compra | página de planes de Base de Datos | oferta InfoNIF |
 *
 * Tener saldo en una no dice nada de la otra. Decirle a alguien con 5.000
 * registros de listado que «tiene saldo» cuando lo que le falta son créditos de
 * consulta es mandarle a mirar donde no está el problema.
 *
 * Los contratos de aquí están **verificados contra el API real**, a diferencia
 * de los de `/dato`: estas rutas no pasan por el control de créditos, así que se
 * pudieron ejecutar con una clave a cero.
 */

/** `POST /credito/consultar-creditos` con cuerpo vacío. Confirmado. */
const RespuestaCreditos = z
  .object({
    response: z
      .object({ cantidad: z.number() })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface Creditos {
  disponibles: number;
}

export async function consultarCreditos(
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<Creditos>> {
  const bruto = await icif(
    "/credito/consultar-creditos",
    usuarioId,
    opciones.senal ? { cuerpo: {}, senal: opciones.senal } : { cuerpo: {} },
  );
  if (bruto.estado !== "ok") return bruto;

  const analizado = RespuestaCreditos.safeParse(bruto.datos);
  return {
    estado: "ok",
    datos: { disponibles: analizado.success ? (analizado.data.response?.cantidad ?? 0) : 0 },
    origenClave: bruto.origenClave,
  };
}

/**
 * `POST /credito/consultar-mes` con `{ ahno, mes }`.
 *
 * El campo se llama `ahno`, con hache. No es una errata de aquí: es como lo
 * espera su API, comprobado. Escribirlo bien devuelve 400.
 */
const RespuestaMes = z
  .object({
    response: z
      .object({
        registros: z.array(z.unknown()).optional(),
        nifContinuacion: z.unknown().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ConsumoNif = z
  .object({
    nif: z.union([z.string(), z.number()]).optional(),
    cantidad: z.number().optional(),
    fechaCreacion: z.string().optional(),
    fechaUltimoUso: z.string().optional(),
  })
  .passthrough();

export type ConsumoNif = z.infer<typeof ConsumoNif>;

export interface ConsumoDelMes {
  anio: number;
  mes: number;
  /** Empresas consultadas ese mes. Cada una costó un crédito. */
  empresas: ConsumoNif[];
  /** Hay más páginas: su API pagina por NIF. */
  hayMas: boolean;
}

export async function consultarConsumoDelMes(
  anio: number,
  mes: number,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<ConsumoDelMes>> {
  const cuerpo = { ahno: anio, mes };
  const bruto = await icif(
    "/credito/consultar-mes",
    usuarioId,
    opciones.senal ? { cuerpo, senal: opciones.senal } : { cuerpo },
  );
  if (bruto.estado !== "ok") return bruto;

  const analizado = RespuestaMes.safeParse(bruto.datos);
  const crudos = analizado.success ? (analizado.data.response?.registros ?? []) : [];
  const empresas = crudos.flatMap((r) => {
    const v = ConsumoNif.safeParse(r);
    return v.success ? [v.data] : [];
  });

  return {
    estado: "ok",
    datos: {
      anio,
      mes,
      empresas,
      hayMas: Boolean(
        analizado.success && analizado.data.response?.nifContinuacion != null,
      ),
    },
    origenClave: bruto.origenClave,
  };
}

/**
 * `POST /credito/consultar-historial` con `{ desde, hasta }`.
 *
 * El formato de fecha es **`yyyy-MM-dd HH:mm`**, con hora y sin segundos. Su
 * propio mensaje de error lo dice cuando se manda solo la fecha, que es como se
 * averiguó. Mandar `2026-08-01` a secas devuelve 400.
 */
export function comoFechaIcif(fecha: Date): string {
  const dosDigitos = (n: number) => String(n).padStart(2, "0");
  return (
    `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}` +
    ` ${dosDigitos(fecha.getHours())}:${dosDigitos(fecha.getMinutes())}`
  );
}

const RespuestaHistorial = z
  .object({
    response: z
      .object({
        registros: z.array(z.unknown()).optional(),
        fechaContinuacion: z.unknown().nullable().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export interface Historial {
  registros: unknown[];
  hayMas: boolean;
}

export async function consultarHistorial(
  desde: Date,
  hasta: Date,
  usuarioId: number | undefined,
  opciones: { senal?: AbortSignal } = {},
): Promise<ResultadoIcif<Historial>> {
  const cuerpo = { desde: comoFechaIcif(desde), hasta: comoFechaIcif(hasta) };
  const bruto = await icif(
    "/credito/consultar-historial",
    usuarioId,
    opciones.senal ? { cuerpo, senal: opciones.senal } : { cuerpo },
  );
  if (bruto.estado !== "ok") return bruto;

  const analizado = RespuestaHistorial.safeParse(bruto.datos);
  return {
    estado: "ok",
    datos: {
      registros: analizado.success ? (analizado.data.response?.registros ?? []) : [],
      hayMas: Boolean(
        analizado.success && analizado.data.response?.fechaContinuacion != null,
      ),
    },
    origenClave: bruto.origenClave,
  };
}
