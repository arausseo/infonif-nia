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
 * **Tarda ~26 segundos**, medido varias veces: no es un pico, es lo que cuesta.
 * Así que ninguna petición de usuario puede esperarlo.
 *
 * Los datos cambian una vez al día, cuando Infonif incorpora o da de baja
 * empresas. Comprobado: dos descargas separadas 2,5 horas salieron idénticas
 * byte a byte. Con esa cadencia, una caché con caducidad dura sería un error
 * sutil: cada vez que venciera, el usuario que llegara primero pagaría los 26
 * segundos. Cuatro veces al día con TTL de 6 h.
 *
 * Por eso la caché es de las que **sirven lo viejo mientras se refrescan**:
 *
 *   - fresco (< TTL)  → se sirve y ya está
 *   - caducado        → se sirve IGUAL, y el refresco arranca en segundo plano
 *   - nada en caché   → única vez que se espera
 *
 * Servir un vocabulario de ayer no tiene coste real: son nombres de provincia y
 * códigos CNAE, y un conteo de facetas que no factura nada. El precio sale de
 * `/buscador/filtrar`, que siempre se consulta en vivo.
 */

const CLAVE_REDIS = "nia:infonif:resumen:v2";
/** Evita que varios nodos se pongan a descargar los mismos 26 segundos. */
const CLAVE_CERROJO = "nia:infonif:resumen:refrescando";

interface EntradaCache {
  /** Milisegundos desde epoch en que se descargó del API. */
  generadoEn: number;
  resumen: ResumenInfonif;
}

let enMemoria: EntradaCache | undefined;
let enVuelo: Promise<EntradaCache> | undefined;
let refrescando = false;

/** Pura, para poder probar la decisión sin red ni reloj real. */
export function estaFresco(
  generadoEn: number,
  ahora: number,
  ttlSegundos: number,
): boolean {
  return ahora - generadoEn < ttlSegundos * 1000;
}

async function descargar(): Promise<EntradaCache> {
  registro.info("descargando el resumen de Infonif (tarda ~26 s)");
  const crudo = await infonif("/buscador/resumen", { tiempoLimiteMs: 90_000 });
  const entrada: EntradaCache = {
    generadoEn: Date.now(),
    resumen: ResumenInfonif.parse(crudo),
  };

  try {
    // La caducidad en Redis es solo una red de seguridad, muy por encima del
    // TTL de frescura: lo que decide si hay que refrescar es `generadoEn`.
    await obtenerRedis().set(
      CLAVE_REDIS,
      JSON.stringify(entrada),
      "EX",
      config.INFONIF_RESUMEN_CADUCIDAD_SEGUNDOS,
    );
  } catch (error) {
    registro.warn({ err: String(error) }, "no se pudo cachear el resumen en Redis");
  }

  return entrada;
}

async function leerDeRedis(): Promise<EntradaCache | undefined> {
  try {
    const crudo = await obtenerRedis().get(CLAVE_REDIS);
    if (!crudo) return undefined;
    const entrada = JSON.parse(crudo) as { generadoEn?: unknown; resumen?: unknown };
    if (typeof entrada.generadoEn !== "number") return undefined;
    return {
      generadoEn: entrada.generadoEn,
      resumen: ResumenInfonif.parse(entrada.resumen),
    };
  } catch (error) {
    registro.warn({ err: String(error) }, "Redis no sirvió el resumen");
    return undefined;
  }
}

/**
 * Lanza el refresco sin esperarlo. Con cerrojo en Redis para que, si hay varios
 * nodos, solo uno cargue con los 26 segundos.
 */
function refrescarEnSegundoPlano(): void {
  if (refrescando) return;
  refrescando = true;

  void (async () => {
    try {
      const cerrojo = await obtenerRedis()
        .set(CLAVE_CERROJO, "1", "EX", 180, "NX")
        .catch(() => "OK"); // sin Redis, refresca igual: peor es no refrescar nunca
      if (cerrojo !== "OK") {
        registro.debug("otro nodo ya está refrescando el resumen");
        return;
      }
      const entrada = await descargar();
      enMemoria = entrada;
      indice = undefined;
      registro.info("resumen refrescado en segundo plano");
    } catch (error) {
      // Da igual: se sigue sirviendo lo viejo y se reintentará en la próxima.
      registro.warn({ err: String(error) }, "falló el refresco del resumen");
    } finally {
      refrescando = false;
    }
  })();
}

/**
 * Devuelve el resumen. Solo espera si no hay absolutamente nada cacheado.
 */
export async function obtenerResumen(): Promise<ResumenInfonif> {
  const ttl = config.INFONIF_RESUMEN_TTL_SEGUNDOS;

  if (enMemoria) {
    if (!estaFresco(enMemoria.generadoEn, Date.now(), ttl)) refrescarEnSegundoPlano();
    return enMemoria.resumen;
  }

  if (enVuelo) return (await enVuelo).resumen;

  enVuelo = (async () => {
    const deRedis = await leerDeRedis();
    if (deRedis) return deRedis;
    return descargar();
  })();

  try {
    enMemoria = await enVuelo;
    indice = undefined;
    if (!estaFresco(enMemoria.generadoEn, Date.now(), ttl)) refrescarEnSegundoPlano();
    return enMemoria.resumen;
  } finally {
    enVuelo = undefined;
  }
}

export interface EstadoCache {
  cargado: boolean;
  generadoEn?: string;
  antiguedadSegundos?: number;
  fresco?: boolean;
  refrescando: boolean;
}

/** Para /salud/dependencias: saber si se está sirviendo algo viejo. */
export function estadoCacheResumen(): EstadoCache {
  if (!enMemoria) return { cargado: false, refrescando };
  const antiguedad = Math.round((Date.now() - enMemoria.generadoEn) / 1000);
  return {
    cargado: true,
    generadoEn: new Date(enMemoria.generadoEn).toISOString(),
    antiguedadSegundos: antiguedad,
    fresco: estaFresco(
      enMemoria.generadoEn,
      Date.now(),
      config.INFONIF_RESUMEN_TTL_SEGUNDOS,
    ),
    refrescando,
  };
}

/**
 * Precarga al arrancar, sin bloquear el arranque. Así el primer usuario no paga
 * los 26 segundos ni siquiera en un despliegue con Redis vacío.
 */
export function precargarResumen(): void {
  void obtenerResumen().catch((error: unknown) => {
    registro.warn({ err: String(error) }, "no se pudo precargar el resumen");
  });
}

/** Descarta lo cacheado en memoria. Para tests y para un refresco forzado. */
export function olvidarResumen(): void {
  enMemoria = undefined;
  indice = undefined;
  refrescando = false;
}

/** Inyecta un resumen ya cargado. Solo para tests. */
export function fijarResumen(resumen: ResumenInfonif, generadoEn = Date.now()): void {
  enMemoria = { generadoEn, resumen };
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
