import { config } from "../../comun/config.js";
import { registro } from "../../comun/registro.js";
import { obtenerRedis } from "../redis/cliente.js";
import { claveProvincia } from "../geo/provincias.js";
import { infonif } from "./cliente.js";
import { ResumenInfonif, type NodoFaceta } from "./tipos.js";

/**
 * El vocabulario de filtros: provincias, CNAE, sectores y rangos, con sus
 * conteos. Sale de `GET /buscador/resumen`.
 *
 * **Tarda ~26 segundos.** No puede colgar de una petición del usuario: se cachea
 * en Redis y se guarda además en memoria del proceso. Se precarga al arrancar.
 *
 * No hay copia de respaldo en disco a propósito. Servir un vocabulario caducado
 * sin avisar es peor que fallar: la copia que teníamos de su fichero estático
 * decía 3,3 millones de empresas cuando el API dice 2,7, y contaba 24 empresas
 * con cuentas de 2024 cuando hay 1,1 millones.
 */

const CLAVE_REDIS = "nia:infonif:resumen:v1";

let enMemoria: ResumenInfonif | undefined;
let enVuelo: Promise<ResumenInfonif> | undefined;

async function descargar(): Promise<ResumenInfonif> {
  const crudo = await infonif("/buscador/resumen", { tiempoLimiteMs: 60_000 });
  const resumen = ResumenInfonif.parse(crudo);

  try {
    await obtenerRedis().set(
      CLAVE_REDIS,
      JSON.stringify(resumen),
      "EX",
      config.INFONIF_RESUMEN_TTL_SEGUNDOS,
    );
  } catch (error) {
    registro.warn({ err: String(error) }, "no se pudo cachear el resumen en Redis");
  }

  return resumen;
}

/** Devuelve el resumen. Memoria → Redis → API. Una sola descarga concurrente. */
export async function obtenerResumen(): Promise<ResumenInfonif> {
  if (enMemoria) return enMemoria;
  if (enVuelo) return enVuelo;

  enVuelo = (async () => {
    try {
      const cacheado = await obtenerRedis().get(CLAVE_REDIS);
      if (cacheado) {
        const resumen = ResumenInfonif.parse(JSON.parse(cacheado));
        registro.debug("resumen servido desde Redis");
        return resumen;
      }
    } catch (error) {
      registro.warn({ err: String(error) }, "Redis no sirvió el resumen; voy al API");
    }
    registro.info("descargando el resumen de Infonif (tarda ~26 s)");
    return descargar();
  })();

  try {
    enMemoria = await enVuelo;
    indice = undefined;
    return enMemoria;
  } finally {
    enVuelo = undefined;
  }
}

/** Descarta lo cacheado. Para tests y para un refresco forzado. */
export function olvidarResumen(): void {
  enMemoria = undefined;
  indice = undefined;
}

/** Inyecta un resumen ya cargado. Solo para tests. */
export function fijarResumen(resumen: ResumenInfonif): void {
  enMemoria = resumen;
  indice = undefined;
}

// ─── Índices derivados ────────────────────────────────────────────────────────

interface Indice {
  /** clave normalizada de provincia → ids `Comunidad|Provincia` (puede haber varios) */
  provincias: Map<string, string[]>;
  /** código CNAE (2, 3 o 4 dígitos) → nodo */
  cnae: Map<string, NodoFaceta>;
  /** etiqueta normalizada de sector Infonif → etiqueta original */
  industria: Map<string, string>;
  /** ids válidos de rango, p. ej. `rango.2` */
  rangosEmpleados: Set<string>;
  rangosAntiguedad: Set<string>;
}

let indice: Indice | undefined;

function recorrer(nodos: readonly NodoFaceta[], visita: (n: NodoFaceta) => void): void {
  for (const nodo of nodos) {
    visita(nodo);
    if (nodo.children) recorrer(nodo.children, visita);
  }
}

function construirIndice(resumen: ResumenInfonif): Indice {
  const provincias = new Map<string, string[]>();
  for (const comunidad of resumen.provincia_localidad) {
    for (const provincia of comunidad.children ?? []) {
      const nombre = provincia.id.split("|")[1];
      if (!nombre) continue;
      const clave = claveProvincia(nombre);
      const ids = provincias.get(clave) ?? [];
      ids.push(provincia.id);
      provincias.set(clave, ids);
    }
  }

  const cnae = new Map<string, NodoFaceta>();
  recorrer(resumen.cnae, (nodo) => {
    if (/^\d{2,4}$/.test(nodo.id)) cnae.set(nodo.id, nodo);
  });

  const industria = new Map<string, string>();
  for (const sector of resumen.industria) {
    industria.set(normalizar(sector.label), sector.label);
  }

  const rangos = (facetas: readonly NodoFaceta[]) =>
    new Set(facetas.map((f) => f.id).filter((id) => id.startsWith("rango.")));

  return {
    provincias,
    cnae,
    industria,
    rangosEmpleados: rangos(resumen.empleados),
    rangosAntiguedad: rangos(resumen.antiguedad),
  };
}

function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export async function obtenerIndice(): Promise<Indice> {
  if (!indice) indice = construirIndice(await obtenerResumen());
  return indice;
}

// ─── Resolución ───────────────────────────────────────────────────────────────

export interface ProvinciasResueltas {
  /** Ids `Comunidad|Provincia` listos para el filtro. */
  ids: string[];
  /** Lo que el usuario escribió y no corresponde a ninguna provincia. */
  noResueltas: string[];
}

/**
 * Traduce nombres de provincia a los ids que espera el filtro.
 *
 * Un solo nombre puede devolver varios ids: en los datos de Infonif hay
 * provincias con más de una grafía (§2 de docs/API-INFONIF.md).
 */
export async function resolverProvincias(
  nombres: readonly string[],
): Promise<ProvinciasResueltas> {
  const { provincias } = await obtenerIndice();
  const ids: string[] = [];
  const noResueltas: string[] = [];

  for (const nombre of nombres) {
    const encontrados = provincias.get(claveProvincia(nombre));
    if (encontrados && encontrados.length > 0) ids.push(...encontrados);
    else noResueltas.push(nombre);
  }

  return { ids: [...new Set(ids)], noResueltas };
}

/** Comprueba que un CNAE existe en su árbol y devuelve su etiqueta y conteo. */
export async function describirCnae(codigo: string): Promise<NodoFaceta | undefined> {
  return (await obtenerIndice()).cnae.get(codigo);
}

/**
 * Ejercicios sobre los que aplicar un criterio financiero.
 *
 * No se puede escribir un año a mano: envejece. Y no vale coger simplemente el
 * más reciente, porque el año en curso apenas tiene cuentas depositadas —en la
 * instantánea de agosto de 2026, 2026 tiene **una** empresa y 2025 tiene 283.094,
 * frente a 1,1 millones de 2024—.
 *
 * La regla: los `cuantos` años más recientes cuya cobertura llegue a
 * `coberturaMinima` del universo. Como varios años significan «al menos uno», el
 * resultado es «facturó eso en alguno de sus últimos ejercicios».
 */
export function ejerciciosRecientes(
  resumen: ResumenInfonif,
  opciones: { cuantos?: number; coberturaMinima?: number } = {},
): string[] {
  const { cuantos = 2, coberturaMinima = 0.2 } = opciones;
  const suelo = resumen.cantidad * coberturaMinima;

  return resumen.cuentas_disponibles
    .filter((faceta) => /^\d{4}$/.test(faceta.id) && faceta.data >= suelo)
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, cuantos)
    .map((faceta) => faceta.id);
}

/** Igual que `ejerciciosRecientes`, pero sobre el resumen ya cargado. */
export async function obtenerEjerciciosRecientes(): Promise<string[]> {
  return ejerciciosRecientes(await obtenerResumen());
}
