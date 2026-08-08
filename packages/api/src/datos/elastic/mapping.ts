import { z } from "zod";
import { PROVINCIAS_ES } from "../geo/provincias.js";

/**
 * INCÓGNITA BLOQUEANTE 2 (CLAUDE.md): no conocemos el mapping real del índice de
 * empresas de Infonif, ni qué campos financieros están normalizados.
 *
 * Esto es el mapping ESPERADO. Se trabaja contra él y contra los fixtures
 * locales hasta tener el real. Cuando llegue, este archivo es lo único que
 * cambia: el compilador de filtros habla contra estos nombres de campo.
 *
 * Supuestos que hay que confirmar con Infonif:
 *   - `ventas` está en euros absolutos, no en miles.
 *   - `fechaConstitucion` es una fecha indexada (para el filtro de antigüedad),
 *     no un año suelto.
 *   - existen banderas `tieneEmail` / `tieneTelefono` indexadas; si no, hay que
 *     filtrar con `exists` sobre `email` / `telefono`.
 *   - el ejercicio fiscal del dato financiero viaja en el documento
 *     (`ejercicioFiscal`). Sin él no se puede cumplir la regla de "cero cifras
 *     sin fuente".
 */

export const RANGOS_VENTAS = [
  "0-100K",
  "100K-500K",
  "500K-2M",
  "2M-10M",
  "10M-50M",
  ">50M",
] as const;

export const SITUACIONES = ["activa", "concursal", "extinguida"] as const;

export const FORMAS_JURIDICAS = ["SL", "SA", "SCOOP", "AUTONOMO", "OTRA"] as const;

export const DocumentoEmpresa = z
  .object({
    nif: z.string().regex(/^[A-Z]\d{8}$/),
    razonSocial: z.string().min(1),
    nombreComercial: z.string().optional(),

    cnae: z.string().regex(/^\d{4}$/),
    cnaeDescripcion: z.string().min(1),

    provincia: z.enum(PROVINCIAS_ES),
    municipio: z.string().min(1),
    codigoPostal: z.string().regex(/^\d{5}$/),

    formaJuridica: z.enum(FORMAS_JURIDICAS),
    fechaConstitucion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    situacion: z.enum(SITUACIONES),

    empleados: z.number().int().min(0),

    // Financieros: siempre con el ejercicio al que corresponden.
    ejercicioFiscal: z.number().int().min(1990).max(2100),
    ventas: z.number().min(0),
    rangoVentas: z.enum(RANGOS_VENTAS),
    ebitda: z.number(),
    resultado: z.number(),
    activoTotal: z.number().min(0),
    fondosPropios: z.number(),

    email: z.string().email().optional(),
    telefono: z.string().optional(),
    web: z.string().optional(),
    tieneEmail: z.boolean(),
    tieneTelefono: z.boolean(),
  })
  .strict();

export type DocumentoEmpresa = z.infer<typeof DocumentoEmpresa>;

/**
 * Campos que se pueden devolver a cualquiera. Todo lo demás se proyecta fuera
 * en `datos/` según los derechos del usuario (ADR-008): la ocultación es
 * proyección en código, no seguridad a nivel de campo del clúster.
 */
export const CAMPOS_PUBLICOS = [
  "nif",
  "razonSocial",
  "nombreComercial",
  "cnae",
  "cnaeDescripcion",
  "provincia",
  "municipio",
  "codigoPostal",
  "formaJuridica",
  "fechaConstitucion",
  "situacion",
  "rangoVentas",
] as const;

/** Requieren derecho verificado dentro de la herramienta antes de devolverse. */
export const CAMPOS_DE_PAGO = [
  "ventas",
  "ebitda",
  "resultado",
  "activoTotal",
  "fondosPropios",
  "empleados",
  "email",
  "telefono",
] as const;

/** Propiedades del mapping, sin envolver. `rutas.envolverMapping()` las adapta a 6.x/7.x. */
export const PROPIEDADES_EMPRESA = {
  nif: { type: "keyword" },
  razonSocial: {
    type: "text",
    analyzer: "espanol_ligero",
    fields: { raw: { type: "keyword" } },
  },
  nombreComercial: {
    type: "text",
    analyzer: "espanol_ligero",
    fields: { raw: { type: "keyword" } },
  },

  cnae: { type: "keyword" },
  cnaeDescripcion: { type: "text", analyzer: "espanol_ligero" },

  provincia: { type: "keyword" },
  municipio: { type: "keyword" },
  codigoPostal: { type: "keyword" },

  formaJuridica: { type: "keyword" },
  fechaConstitucion: { type: "date", format: "yyyy-MM-dd" },
  situacion: { type: "keyword" },

  empleados: { type: "integer" },

  ejercicioFiscal: { type: "short" },
  ventas: { type: "double" },
  rangoVentas: { type: "keyword" },
  ebitda: { type: "double" },
  resultado: { type: "double" },
  activoTotal: { type: "double" },
  fondosPropios: { type: "double" },

  email: { type: "keyword" },
  telefono: { type: "keyword" },
  web: { type: "keyword" },
  tieneEmail: { type: "boolean" },
  tieneTelefono: { type: "boolean" },
} as const;

/**
 * Analizador propio en lugar del `spanish` de serie: `spanish` aplica stemming
 * agresivo y "logística" y "logístico" colisionan con ruido. Aquí solo se
 * pliegan acentos y minúsculas, que es lo que necesita una razón social.
 */
export const AJUSTES_INDICE = {
  number_of_shards: 1,
  number_of_replicas: 0,
  analysis: {
    analyzer: {
      espanol_ligero: {
        type: "custom",
        tokenizer: "standard",
        filter: ["lowercase", "asciifolding"],
      },
    },
  },
} as const;

/** Calcula el rango declarado a partir de la cifra de ventas. Fuente única. */
export function rangoDeVentas(ventas: number): (typeof RANGOS_VENTAS)[number] {
  if (ventas < 100_000) return "0-100K";
  if (ventas < 500_000) return "100K-500K";
  if (ventas < 2_000_000) return "500K-2M";
  if (ventas < 10_000_000) return "2M-10M";
  if (ventas < 50_000_000) return "10M-50M";
  return ">50M";
}
