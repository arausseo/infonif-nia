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

const texto = z.union([z.string(), z.number()]).optional();

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
    procesadas: texto,
  })
  .passthrough();

export type Deposito = z.infer<typeof Deposito>;

// ─── Balance resumido ────────────────────────────────────────────────────────

/** Va en `listado.partida`. No se expone: `obtener_magnitudes` ya lo cubre gratis. */
export const RespuestaBalance = z
  .object({
    listado: z.object({ partida: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough();
