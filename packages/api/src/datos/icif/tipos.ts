import { z } from "zod";

/**
 * Formas de respuesta del gateway, **contrastadas contra el API real**.
 *
 * Hasta tener una clave con saldo estuvieron deducidas leyendo su código, y el
 * contraste demostró que eso no basta: los contenedores estaban bien —`empresa`,
 * `listado.cargo`, `listado.acto`…— pero **los campos de dentro fallaban en casi
 * todos**. Los cuatro del BORME estaban mal, y en depósitos el año se llama
 * `anno`, no `ejercicio`, así que la lista de ejercicios salía siempre vacía sin
 * que nada se quejara.
 *
 * Es el argumento a favor de haberlos dejado permisivos: con `.strict()` habría
 * fallado a lo bruto en producción en vez de degradar. Se mantienen así, porque
 * lo verificado es una respuesta de una empresa, no el contrato entero.
 *
 * Referencia: MERCADONA SA (A46103834), agosto de 2026.
 */

/**
 * `fast-xml-parser` convierte una lista de un elemento en el elemento suelto.
 * Su propio código lo parchea a mano para `listado.deposito`, lo que confirma
 * que el problema es real; lo que no está es el parche para el resto.
 *
 * Sin esto, una empresa con un solo administrador devolvería un objeto donde el
 * resto devuelve un array — el fallo aparecería justo en el caso más común de
 * una pyme.
 */
export function comoLista<T>(valor: T | T[] | undefined | null): T[] {
  if (valor == null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

/**
 * Un campo de texto del gateway, tolerante con su forma de decir «vacío».
 *
 * **Este API representa los campos vacíos como `{}`, no como cadena vacía.** Es
 * sistemático y está en la documentación: `fechacese: {}` en un cargo vigente,
 * `subgrupo: {}` y `urlficheroborme: {}` en un acto del BORME. Sale de convertir
 * XML a JSON: un elemento sin contenido se vuelve un objeto sin claves.
 *
 * **Con `?tipo=json` la respuesta real usa `""`, no `{}`**, y eso el esquema ya
 * lo aceptaba: comprobado con 126 cargos de dos empresas, ninguno traía `{}`.
 * Así que esto NO estaba rompiendo nada hoy. Se corrige igualmente porque la
 * forma documentada es la del `{}` —sale de convertir XML a JSON, y `?tipo=xml`
 * es una opción del mismo API—, y porque el modo de fallar sería el peor
 * posible: `safeParse` rechaza el registro, el `flatMap` lo descarta sin avisar
 * y la herramienta contesta «no consta ninguno». Un administrador en activo
 * siempre lleva la fecha de cese vacía, así que se perderían justo los cargos
 * vigentes.
 */
const texto = z.preprocess(
  (v) => (esVacio(v) ? undefined : v),
  z.union([z.string(), z.number()]).optional(),
);

/** `{}`, `[]`, `null` y la cadena vacía son la misma cosa: no hay dato. */
function esVacio(valor: unknown): boolean {
  if (valor == null) return true;
  if (typeof valor === "string") return valor.trim() === "";
  if (Array.isArray(valor)) return valor.length === 0;
  if (typeof valor === "object") return Object.keys(valor as object).length === 0;
  return false;
}

// ─── Perfil ──────────────────────────────────────────────────────────────────

export const PerfilEmpresa = z
  .object({
    empresa: z
      .object({
        nif: texto,
        razonsocial: texto,
        fechaconstitucion: texto,
        // OJO: `direccion` y `localidad`. Al deducirlo puse `domicilio` y
        // `poblacion`, que no existen.
        direccion: texto,
        localidad: texto,
        provincia: texto,
        codprovinciaine: texto,
        codigopostal: texto,
        domicilioborme: texto,
        telefono: texto,
        email: texto,
        denominacionanterior: texto,
        registromercantil: texto,
        auditor: texto,
        industria: texto,
        ultimascuentaspresentadas: texto,
        objetosocial: texto,
        cnae: texto,
        cnaedescripcion: texto,
        cnaecodigo: texto,
        empleados: texto,
        web: texto,
        urlperfilinfonif: texto,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type PerfilEmpresa = z.infer<typeof PerfilEmpresa>;

// ─── Cargos ──────────────────────────────────────────────────────────────────

export const RespuestaCargos = z
  .object({
    listado: z.object({ cargo: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough();

export const Cargo = z
  .object({
    /** «Activo» o el que corresponda. No lo había previsto y es lo primero que se mira. */
    estado: texto,
    /** Puede ser una sociedad, no solo una persona: en Mercadona sale «INMO ALAMEDA SL». */
    nombre: texto,
    cargo: texto,
    fechanombramiento: texto,
    /** Vacío mientras el cargo siga vigente. */
    fechacese: texto,
    /** En cuántas sociedades más figura. No se expone: sería tirar del hilo de una persona. */
    vinculaciones: texto,
  })
  .passthrough();

export type Cargo = z.infer<typeof Cargo>;

// ─── BORME ───────────────────────────────────────────────────────────────────

export const RespuestaActosBorme = z
  .object({
    listado: z.object({ acto: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough();

/**
 * Un acto del BORME. **Los cuatro campos que deduje estaban mal**: no hay
 * `fecha`, ni `registro`, ni `acto`, ni `descripcion`.
 *
 * Lo que hay es más útil, además: el acto viene clasificado en `grupo` y
 * `subgrupo` («Nombramientos.» / «Apoderado:») con el `detalle` aparte, y trae
 * el enlace al PDF oficial del BOE.
 */
export const ActoBorme = z
  .object({
    tipo: texto,
    numacto: texto,
    fechaborme: texto,
    /** Qué clase de acto: «Nombramientos.», «Ceses/Dimisiones.»… */
    grupo: texto,
    /** El matiz dentro del grupo: «Apoderado:», «Consejero:»… */
    subgrupo: texto,
    /** El contenido: normalmente el nombre de la persona o el dato que cambia. */
    detalle: texto,
    /** PDF oficial en boe.es. */
    urlficheroborme: texto,
    cve: texto,
  })
  .passthrough();

export type ActoBorme = z.infer<typeof ActoBorme>;

// ─── Grupo ───────────────────────────────────────────────────────────────────

export const RespuestaEmpresasGrupo = z
  .object({
    listado: z.object({ empresa: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough();

/**
 * Una empresa del grupo. No hay `relacion` ni `participacion` como supuse: la
 * relación se expresa con **`matriz`**, que vale 1 si esa empresa es la matriz.
 */
export const EmpresaGrupo = z
  .object({
    nif: texto,
    razonsocial: texto,
    /** 1 = es la matriz. 0 = participada o vinculada. */
    matriz: texto,
  })
  .passthrough();

export type EmpresaGrupo = z.infer<typeof EmpresaGrupo>;

// ─── Depósitos ───────────────────────────────────────────────────────────────

export const RespuestaDepositos = z
  .object({
    listado: z.object({ deposito: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough();

/**
 * Un depósito de cuentas.
 *
 * **El año se llama `anno`, no `ejercicio`.** Es el error que más caro salía:
 * la lista de ejercicios se construía leyendo un campo inexistente, así que
 * salía vacía siempre y la herramienta contestaba «no consta ninguna cuenta»
 * sobre empresas que sí las tenían. Un fallo que no lanza ninguna excepción.
 *
 * `consolidado` viene aquí y es justo el parámetro obligatorio que pide la
 * descarga del depósito: de esta lista sale con qué valores pedirlo.
 */
export const Deposito = z
  .object({
    anno: texto,
    /** 0 individuales, 1 consolidadas. */
    consolidado: texto,
    /**
     * Si Infonif ya tiene procesado ese depósito.
     *
     * La documentación se contradice consigo misma: el ejemplo de respuesta lo
     * llama `disponible` y la tabla de propiedades de la MISMA página lo llama
     * `procesadas`. La respuesta real trae `procesadas`, así que se declaran los
     * dos y se lee el que venga.
     */
    procesadas: texto,
    disponible: texto,
  })
  .passthrough();

export type Deposito = z.infer<typeof Deposito>;

// ─── Balance resumido ────────────────────────────────────────────────────────

export const RespuestaBalance = z
  .object({
    listado: z.object({ partida: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough();

/**
 * Una partida del balance.
 *
 * **Las claves de los años son dinámicas**: `valor2025`, `valor2024`,
 * `valor2023`… No se pueden declarar en el esquema, así que se dejan pasar y se
 * extraen en tiempo de ejecución. Cuántos años vengan depende de la empresa.
 *
 * El `codigo` es el mismo que usa el catálogo de campos comprables: `49500` es
 * Resultado del ejercicio en los dos sitios.
 */
export const Partida = z
  .object({
    codigo: z.union([z.string(), z.number()]),
    descripcion: z.string(),
    /**
     * **En qué unidad vienen los valores**: 1 euros, 1000 miles de euros,
     * 1000000 millones. Está documentado y no se leía, y es el peor sitio
     * posible para un descuido: una empresa que presenta en miles habría salido
     * con cifras mil veces menores sin que nada fallara. Regla 4.
     */
    magnitud: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type Partida = z.infer<typeof Partida>;

/**
 * Saca los `valorYYYY` de una partida, **ya convertidos a euros**.
 *
 * Dos detalles que la respuesta real obliga a tratar:
 *
 * - El mismo documento mezcla números y cadenas en el mismo campo. En Mercadona
 *   un 20 % de los valores llegan como texto; ahí todos son `""` —años sin
 *   dato— pero el PDF documenta importes reales como `"424734.82"`. Aceptando
 *   solo `number` se perdían sin avisar.
 * - `magnitud` multiplica. Si falta se asume 1, que es lo que devuelve el API
 *   en la práctica y equivale a no tocar el valor.
 */
export function valoresPorEjercicio(partida: Partida): Record<string, number> {
  const escala = aNumero(partida.magnitud) ?? 1;
  const salida: Record<string, number> = {};

  for (const [clave, valor] of Object.entries(partida)) {
    const anio = /^valor(\d{4})$/.exec(clave)?.[1];
    if (!anio) continue;
    const n = aNumero(valor);
    if (n !== undefined) salida[anio] = n * escala;
  }
  return salida;
}

/** Número, o cadena que lo sea. La cadena vacía es «no hay dato», no un cero. */
function aNumero(valor: unknown): number | undefined {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : undefined;
  if (typeof valor !== "string") return undefined;

  const limpio = valor.trim();
  if (limpio === "") return undefined;

  // El API usa el punto como separador decimal; se admite la coma por si alguna
  // partida viniera con formato español.
  const n = Number(limpio.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}
