import { z } from "zod";
import { ErrorValidacion } from "../../comun/errores.js";

/**
 * Compilador de `FiltroSegmento` a la petición de `POST /buscador/filtrar`.
 *
 * El modelo NUNCA emite esta petición: emite un `FiltroSegmento` validado con
 * Zod `.strict()` y este código lo traduce (regla no negociable 3).
 *
 * El núcleo (`compilar`) es una función pura: recibe los ids de provincia ya
 * resueltos y no toca la red. Así se puede probar exhaustivamente, que es lo que
 * pide la Fase 1 del PLAN.
 */

// ─── Lo que puede pedir el modelo ─────────────────────────────────────────────

const Rango = z
  .object({ min: z.number().nonnegative(), max: z.number().nonnegative() })
  .partial()
  .refine((r) => r.min !== undefined || r.max !== undefined, {
    message: "Un rango necesita al menos min o max",
  })
  .refine((r) => r.min === undefined || r.max === undefined || r.min <= r.max, {
    message: "El mínimo no puede superar al máximo",
  });

export const FiltroSegmento = z
  .object({
    /** Clases CNAE de 2 a 4 dígitos. Las resuelve la capa semántica, no el modelo. */
    cnae: z
      .array(z.string().regex(/^\d{2,4}$/))
      .max(20)
      .optional(),
    /** Etiquetas del sector propio de Infonif, alternativa al CNAE. */
    sectores: z.array(z.string().min(2)).max(10).optional(),
    /** Nombres de provincia en cualquier grafía; se normalizan antes de compilar. */
    provincias: z.array(z.string().min(2)).max(52).optional(),
    /** Cifra de ventas en euros, del último ejercicio con cuentas depositadas. */
    ventas: Rango.optional(),
    empleados: Rango.optional(),
    ebitdaPositivo: z.boolean().optional(),
    antiguedadMinAnios: z.number().int().min(0).max(150).optional(),
    conEmail: z.boolean().optional(),
    conTelefono: z.boolean().optional(),
  })
  .strict();

export type FiltroSegmento = z.infer<typeof FiltroSegmento>;

// ─── Lo que entiende Infonif ──────────────────────────────────────────────────

/** Un estado del embudo: las claves de filtro activas hasta ese paso. */
export type EstadoFiltro = Record<string, string[]>;

export interface PeticionFiltrar {
  [clave: string]: string[] | EstadoFiltro[];
  /** El embudo acumulativo. Obligatorio: su API no responde si va vacío. */
  filtros: EstadoFiltro[];
  campos_requeridos: string[];
}

/** Todas las claves van siempre, con array vacío si no se filtra. */
const CLAVES_VACIAS = [
  "codigosPostales",
  "cif",
  "comunidades",
  "Provincias",
  "Localidades",
  "antiguedad",
  "razonSocial",
  "auditores",
  "empleados",
  "cuentasDisponibles",
  "TipoCuentas",
  "sector_actividad",
  "cargo",
  "vinculaciones",
  "balance",
  "perdidas",
  "ratios",
  "estado",
] as const;

/** Partidas que sabemos filtrar. Los códigos son los de `campos-comprables.json`. */
const PARTIDAS = {
  ventas: { codigo: "99053", etiqueta: "Ventas" },
  ebitda: { codigo: "99016", etiqueta: "EBITDA" },
} as const;

/**
 * `1` = cuentas individuales, que es lo que trae seleccionado su buscador y lo
 * que tiene casi todo el mundo.
 *
 * Medido contra el API: con `1` el filtro «ventas ≥ 2 M en 2024» da 99.122
 * empresas; con `0` o con `5` da 2.423. O sea que `0` **no** significa
 * «cualquier tipo» en la petición, aunque sí lo signifique en los ids de la
 * respuesta. Poner `0` aquí se comería el 97 % del segmento sin avisar.
 */
const TIPO_CUENTA_INDIVIDUAL = "1";

/** Tope que usa su propio frontend cuando el «hasta» va vacío. */
const SIN_TOPE = 99_999_999;

/** Antigüedad máxima admitida por el esquema de `FiltroSegmento`. */
const ANTIGUEDAD_MAX = 150;

/**
 * Un criterio sobre una partida financiera.
 *
 * Formato: `años|partida-etiqueta|desde|hasta|tipoCuenta`.
 *
 * Los años son **obligatorios**: mandar `null` ahí devuelve un 500. Varios años
 * separados por comas significan «al menos uno de ellos» — medido: 2024 da
 * 99.122 empresas, 2023 da 103.596 y `2023,2024` da 113.619, que es más que
 * cualquiera de los dos.
 */
function partida(
  cual: keyof typeof PARTIDAS,
  ejercicios: readonly string[],
  min: number | undefined,
  max: number | undefined,
): string {
  const { codigo, etiqueta } = PARTIDAS[cual];
  const desde = min === undefined ? "null" : String(min);
  const hasta = max === undefined ? "null" : String(max);
  return `${ejercicios.join(",")}|${codigo}-${etiqueta}|${desde}|${hasta}|${TIPO_CUENTA_INDIVIDUAL}`;
}

// ─── El compilador ────────────────────────────────────────────────────────────

/** Un paso del embudo: un criterio del usuario y lo que añade a la petición. */
export interface Paso {
  /** Identificador estable, para casar el evento `status` con su conteo. */
  criterio:
    "actividad" | "ubicacion" | "empleados" | "ventas" | "rentabilidad" | "antiguedad";
  /** Texto para el usuario. */
  etiqueta: string;
  /** Claves que este paso añade al estado acumulado. */
  aporta: EstadoFiltro;
}

export interface FiltroCompilado {
  peticion: PeticionFiltrar;
  /** Los pasos, en el orden en que se cuentan. Vacío si no hay ningún criterio. */
  pasos: Paso[];
  /** Campos cuya presencia se exige. Recorta el segmento, no solo el precio. */
  camposRequeridos: string[];
}

export interface ContextoCompilacion {
  /**
   * Ids `Comunidad|Provincia` ya resueltos. Una provincia puede aportar varios
   * porque en sus datos hay grafías duplicadas.
   */
  provincias?: readonly string[];
  /**
   * Ejercicios sobre los que se aplican los criterios financieros. Los aporta
   * `ejerciciosRecientes()` a partir del resumen en vivo, para que no envejezca
   * un año escrito a mano en el código.
   */
  ejercicios?: readonly string[];
}

/** Traduce un filtro a la petición de Infonif. */
export function compilar(
  filtro: FiltroSegmento,
  contexto: ContextoCompilacion = {},
): FiltroCompilado {
  const idsProvincia = contexto.provincias ?? [];
  const ejercicios = contexto.ejercicios ?? [];
  const pideFinancieros = filtro.ventas !== undefined || filtro.ebitdaPositivo === true;

  if (pideFinancieros && ejercicios.length === 0) {
    throw new ErrorValidacion(
      "Un criterio financiero necesita al menos un ejercicio: su API devuelve 500 si el año va vacío",
    );
  }

  const pasos: Paso[] = [];

  const actividad = [
    ...(filtro.cnae ?? []).map((codigo) => `cnae|${codigo}`),
    ...(filtro.sectores ?? []).map((sector) => `icif|${sector}`),
  ];
  if (actividad.length > 0) {
    pasos.push({
      criterio: "actividad",
      etiqueta: etiquetaActividad(filtro),
      aporta: { sector_actividad: actividad },
    });
  }

  if (idsProvincia.length > 0) {
    pasos.push({
      criterio: "ubicacion",
      etiqueta: `${idsProvincia.length} ${idsProvincia.length === 1 ? "provincia" : "provincias"}`,
      aporta: { Provincias: [...idsProvincia] },
    });
  }

  if (filtro.empleados) {
    const min = filtro.empleados.min ?? 0;
    const max = filtro.empleados.max ?? SIN_TOPE;
    pasos.push({
      criterio: "empleados",
      etiqueta: etiquetaRango("empleados", filtro.empleados),
      aporta: { empleados: [`empleados:${min}|${max}`] },
    });
  }

  if (filtro.ventas) {
    pasos.push({
      criterio: "ventas",
      etiqueta: `${etiquetaRango("ventas (€)", filtro.ventas)} en ${ejercicios.join(" o ")}`,
      aporta: {
        perdidas: [partida("ventas", ejercicios, filtro.ventas.min, filtro.ventas.max)],
      },
    });
  }

  if (filtro.ebitdaPositivo) {
    pasos.push({
      criterio: "rentabilidad",
      etiqueta: `EBITDA positivo en ${ejercicios.join(" o ")}`,
      // Su filtro es inclusivo por abajo, así que «positivo» se pide desde 1 €.
      aporta: { perdidas: [partida("ebitda", ejercicios, 1, undefined)] },
    });
  }

  if (filtro.antiguedadMinAnios !== undefined) {
    pasos.push({
      criterio: "antiguedad",
      etiqueta: `${filtro.antiguedadMinAnios} años o más`,
      aporta: { antiguedad: [`ahnos:${filtro.antiguedadMinAnios}|${ANTIGUEDAD_MAX}`] },
    });
  }

  const camposRequeridos: string[] = [];
  if (filtro.conEmail) camposRequeridos.push("Email");
  if (filtro.conTelefono) camposRequeridos.push("Telefono");

  return { peticion: armar(pasos, camposRequeridos), pasos, camposRequeridos };
}

/**
 * Monta la petición a partir de los pasos.
 *
 * `filtros` es el embudo acumulativo y es obligatorio: su API ni siquiera
 * responde si va vacío. `hasta` permite pedir un prefijo, que es como se obtiene
 * el conteo de cada paso.
 */
export function armar(
  pasos: readonly Paso[],
  camposRequeridos: readonly string[],
  hasta: number = pasos.length,
): PeticionFiltrar {
  const acumulado: EstadoFiltro = {};
  const filtros: EstadoFiltro[] = [];

  for (const paso of pasos.slice(0, hasta)) {
    for (const [clave, valores] of Object.entries(paso.aporta)) {
      acumulado[clave] = [...(acumulado[clave] ?? []), ...valores];
    }
    filtros.push(estructurar(acumulado));
  }

  const peticion: PeticionFiltrar = {
    ...Object.fromEntries(CLAVES_VACIAS.map((clave) => [clave, acumulado[clave] ?? []])),
    filtros,
    campos_requeridos: [...camposRequeridos],
  };
  return peticion;
}

/** Copia profunda del estado acumulado: cada paso del embudo es independiente. */
function estructurar(estado: EstadoFiltro): EstadoFiltro {
  return Object.fromEntries(Object.entries(estado).map(([k, v]) => [k, [...v]]));
}

// ─── Etiquetas para el usuario ────────────────────────────────────────────────

function etiquetaActividad(filtro: FiltroSegmento): string {
  const partes: string[] = [];
  if (filtro.cnae?.length) {
    partes.push(
      `${filtro.cnae.length} ${filtro.cnae.length === 1 ? "actividad CNAE" : "actividades CNAE"}`,
    );
  }
  if (filtro.sectores?.length) {
    partes.push(
      `${filtro.sectores.length} ${filtro.sectores.length === 1 ? "sector" : "sectores"}`,
    );
  }
  return partes.join(" y ");
}

function etiquetaRango(que: string, rango: { min?: number; max?: number }): string {
  const numero = (n: number) => n.toLocaleString("es-ES");
  if (rango.min !== undefined && rango.max !== undefined) {
    return `${que} entre ${numero(rango.min)} y ${numero(rango.max)}`;
  }
  if (rango.min !== undefined) return `${que} desde ${numero(rango.min)}`;
  return `${que} hasta ${numero(rango.max as number)}`;
}
