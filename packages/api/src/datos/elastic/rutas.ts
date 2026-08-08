import { config } from "../../comun/config.js";

/**
 * INCÓGNITA BLOQUEANTE 1 (CLAUDE.md): no sabemos si el clúster de Infonif es 6.x
 * o 7.x. Toda la diferencia se aísla aquí:
 *
 *   - 6.x: la ruta lleva el tipo (`/empresas/_doc/_search`) y el mapping va
 *     envuelto en el nombre del tipo. El bulk exige `_type` en la acción.
 *   - 7.x: sin tipo en ninguna parte.
 *
 * Nada fuera de este archivo debe preguntar por la versión.
 */
export type VersionEs = "6" | "7";

/** Nombre de tipo usado en 6.x. En el índice real puede ser otro (p. ej. "empresa"). */
export const TIPO_ES6 = "_doc";

export interface RutasEs {
  readonly version: VersionEs;
  readonly indice: string;
  /** `/empresas/_search` o `/empresas/_doc/_search` */
  readonly buscar: string;
  /** `/empresas/_count` o `/empresas/_doc/_count` */
  readonly contar: string;
  readonly bulk: string;
  readonly refrescar: string;
  /** Ruta del índice a secas: crear, borrar, comprobar existencia. */
  readonly indiceRaiz: string;
  /** Envuelve las propiedades del mapping según la versión. */
  envolverMapping(propiedades: object): object;
  /** Acción `index` de una línea de bulk. */
  accionBulk(id: string): object;
  /** Ruta de un documento por id. */
  documento(id: string): string;
}

export function construirRutas(
  version: VersionEs = config.ES_VERSION,
  indice: string = config.ES_INDICE,
): RutasEs {
  const conTipo = version === "6";
  const prefijo = conTipo ? `/${indice}/${TIPO_ES6}` : `/${indice}`;

  return {
    version,
    indice,
    buscar: `${prefijo}/_search`,
    contar: `${prefijo}/_count`,
    bulk: `/${indice}/_bulk`,
    refrescar: `/${indice}/_refresh`,
    indiceRaiz: `/${indice}`,
    envolverMapping(propiedades) {
      return conTipo
        ? { [TIPO_ES6]: { properties: propiedades } }
        : { properties: propiedades };
    },
    accionBulk(id) {
      return conTipo
        ? { index: { _index: indice, _type: TIPO_ES6, _id: id } }
        : { index: { _index: indice, _id: id } };
    },
    documento(id) {
      return conTipo
        ? `/${indice}/${TIPO_ES6}/${encodeURIComponent(id)}`
        : `/${indice}/_doc/${encodeURIComponent(id)}`;
    },
  };
}

export const rutas = construirRutas();
