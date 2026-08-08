import { z } from "zod";

/**
 * Esquemas de lo que devuelve el API de Infonif.
 *
 * No hay Swagger: esto es la especificación, deducida del API en vivo y del
 * frontend Vue (docs/API-INFONIF.md). Todo lo que entra desde fuera se valida.
 *
 * Deliberadamente NO son `.strict()`: si Infonif añade campos, no queremos que
 * Nia se caiga. Lo que sí exigimos es que esté lo que usamos.
 */

/** Nodo de faceta. La jerarquía se recorre por `children`. */
export interface NodoFaceta {
  id: string;
  label: string;
  data: number;
  children?: NodoFaceta[] | null;
}

export const NodoFaceta: z.ZodType<NodoFaceta> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    data: z.number(),
    children: z.array(NodoFaceta).nullable().optional(),
  }),
);

/** `GET /buscador/resumen`. */
export const ResumenInfonif = z.object({
  cantidad: z.number().int().nonnegative(),
  antiguedad: z.array(NodoFaceta),
  empleados: z.array(NodoFaceta),
  provincia: z.array(NodoFaceta),
  provincia_localidad: z.array(NodoFaceta),
  cnae: z.array(NodoFaceta),
  industria: z.array(NodoFaceta),
  cuentas_disponibles: z.array(NodoFaceta),
  tipo_cuentas: z.array(NodoFaceta),
});

export type ResumenInfonif = z.infer<typeof ResumenInfonif>;

/** Una fila de `campos_disponibles`: `{ id, data }`. */
export const CampoDisponible = z.object({ id: z.string(), data: z.number() });
export type CampoDisponible = z.infer<typeof CampoDisponible>;

/**
 * `POST /buscador/filtrar?resumen=false`.
 *
 * Además de estas claves trae una `filtro.{n-1}` con el conteo del último paso
 * del embudo. Como el índice es variable, se lee aparte (ver `segmentos.ts`).
 */
export const RespuestaFiltrar = z
  .object({
    cantidad: z.number().int().nonnegative(),
    campos_disponibles: z.array(CampoDisponible),
  })
  .passthrough();

export type RespuestaFiltrar = z.infer<typeof RespuestaFiltrar>;

/** Una empresa del autocompletado. Las claves cortas son suyas, no nuestras. */
export const EmpresaAutocomplete = z.object({
  nif: z.string(),
  rs: z.string(),
  nifn: z.string().optional(),
  url: z.string().optional().nullable(),
  /** Sector propio de Infonif (taxonomía `industria`), no CNAE. */
  s: z.string().nullable().optional(),
  /** Provincia del domicilio. Sin normalizar: conviven "MALAGA" y "Madrid". */
  p: z.string().nullable().optional(),
  /** Otra provincia; hipótesis: la del registro mercantil. */
  r: z.string().nullable().optional(),
  l: z.string().nullable().optional(),
  lb: z.string().nullable().optional(),
  /** 1 = denominación vigente. Un mismo NIF aparece varias veces. */
  ea: z.number().int().optional(),
  /** Relevancia; la lista viene ordenada de mayor a menor. */
  pts: z.number().optional(),
  dir: z.string().nullable().optional(),
  loc: z.string().nullable().optional(),
  cp: z.string().nullable().optional(),
});

export type EmpresaAutocomplete = z.infer<typeof EmpresaAutocomplete>;

export const RespuestaAutocomplete = z.object({
  empresas: z.array(EmpresaAutocomplete),
});

/**
 * `GET /buscador/planBBDD?idusuario=`, verificado en vivo el 08/08/2026.
 *
 * Solo devuelve cuerpo si el usuario tiene plan de registros contratado. Si no
 * lo tiene, responde **204 sin cuerpo** — no un JSON con nulos.
 *
 * Ojo con `numRegistrosMensuales`: el nombre engaña. No es un cupo mensual, es
 * el total contratado —su propio portal lo rotula «Registros contratados»— y va
 * acompañado de una fecha de fin de contrato.
 */
export const PlanBBDD = z
  .object({
    iD_usuario: z.number().int().nullable().optional(),
    numRegistrosMensuales: z.number().nullable().optional(),
    numRegistrosConsumidos: z.number().nullable().optional(),
    fechaFinContrato: z.string().nullable().optional(),
  })
  .passthrough();

export type PlanBBDD = z.infer<typeof PlanBBDD>;
