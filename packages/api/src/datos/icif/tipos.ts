import { z } from "zod";

/**
 * Formas de respuesta del gateway.
 *
 * **Estos esquemas son deliberadamente permisivos, y va en contra de la norma
 * del proyecto por un motivo concreto.**
 *
 * La regla dice Zod `.strict()` en todo borde externo, y es la correcta para lo
 * que entra: los argumentos que emite el modelo. Ahí lo estricto impide que se
 * invente un campo y que el código haga algo con él.
 *
 * Aquí es al revés. Esto es lo que SALE de un servicio de terceros cuyo contrato
 * no está documentado y que **todavía no hemos podido ejecutar** —no hay clave
 * válida para probar—. Se ha deducido leyendo su código. Un `.strict()` sobre
 * una forma deducida no protege de nada: garantiza que el día que añadan un
 * campo, Nia deje de responder sobre esa empresa. Se valida lo que se va a leer
 * y se deja pasar el resto.
 *
 * Cuando haya una clave de pruebas, esto se contrasta contra respuestas reales.
 * Hasta entonces, cada esquema lleva anotado de dónde salió.
 */

/**
 * El gateway convierte XML a JSON con `fast-xml-parser`, y ese conversor tiene
 * una trampa clásica: **una lista de un solo elemento no es una lista**, es el
 * elemento suelto. Su propio código lo parchea a mano para `listado.deposito`
 * (`utils.ts`, `respData`), lo que confirma que el problema es real; lo que no
 * está es el parche para el resto de listados.
 *
 * Aquí se normaliza siempre. Sin esto, una empresa con un solo administrador
 * devolvería un objeto donde el resto devuelve un array, y el fallo aparecería
 * justo en el caso más común de una pyme.
 */
export function comoLista<T>(valor: T | T[] | undefined | null): T[] {
  if (valor == null) return [];
  return Array.isArray(valor) ? valor : [valor];
}

/** Deducido de `utils.ts`: normalizan `empresa.codigopostal` y `codprovinciaine`. */
export const PerfilEmpresa = z
  .object({
    empresa: z
      .object({
        nif: z.union([z.string(), z.number()]).optional(),
        razonsocial: z.string().optional(),
        domicilio: z.string().optional(),
        codigopostal: z.union([z.string(), z.number()]).optional(),
        poblacion: z.string().optional(),
        provincia: z.string().optional(),
        codprovinciaine: z.union([z.string(), z.number()]).optional(),
        cnae: z.union([z.string(), z.number()]).optional(),
        objetosocial: z.string().optional(),
        fechaconstitucion: z.union([z.string(), z.number()]).optional(),
        situacion: z.string().optional(),
        telefono: z.union([z.string(), z.number()]).optional(),
        web: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type PerfilEmpresa = z.infer<typeof PerfilEmpresa>;

/**
 * Cargos. La ruta exige `estado` en el cuerpo además del NIF (`getEstado`), así
 * que el llamante tiene que decidir si quiere los vigentes o todos.
 */
export const RespuestaCargos = z
  .object({
    listado: z
      .object({
        cargo: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const Cargo = z
  .object({
    nombre: z.string().optional(),
    cargo: z.string().optional(),
    fechanombramiento: z.union([z.string(), z.number()]).optional(),
    fechacese: z.union([z.string(), z.number()]).optional(),
    nifcargo: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type Cargo = z.infer<typeof Cargo>;

export const RespuestaActosBorme = z
  .object({
    listado: z
      .object({
        acto: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ActoBorme = z
  .object({
    fecha: z.union([z.string(), z.number()]).optional(),
    registro: z.string().optional(),
    acto: z.string().optional(),
    descripcion: z.string().optional(),
  })
  .passthrough();

export type ActoBorme = z.infer<typeof ActoBorme>;

export const RespuestaEmpresasGrupo = z
  .object({
    listado: z
      .object({
        empresa: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const EmpresaGrupo = z
  .object({
    nif: z.union([z.string(), z.number()]).optional(),
    razonsocial: z.string().optional(),
    relacion: z.string().optional(),
    participacion: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type EmpresaGrupo = z.infer<typeof EmpresaGrupo>;

/** El único cuyo `listado` sabemos seguro que es array: lo fuerzan ellos. */
export const RespuestaDepositos = z
  .object({
    listado: z
      .object({
        deposito: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const Deposito = z
  .object({
    ejercicio: z.union([z.string(), z.number()]).optional(),
    id: z.union([z.string(), z.number()]).optional(),
    tipo: z.string().optional(),
    fechadeposito: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

export type Deposito = z.infer<typeof Deposito>;
