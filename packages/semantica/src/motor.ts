import { casos, clasePorCodigo, type ClaseCnae } from "./corpus.js";
import { buscarLexico, normalizar } from "./lexico.js";
import { MARGEN_RELATIVO, MODELO, prefijoConsulta } from "./modelo.js";
import { hayArtefacto, masCercanos } from "./vectores.js";

/**
 * Texto libre del usuario → códigos CNAE.
 *
 * Dos capas, en este orden:
 *
 *   1. **Términos curados.** Resuelve en microsegundos y se puede explicar:
 *      «logística» sale de 4941 porque alguien lo escribió en el corpus.
 *   2. **Embeddings.** Cubre lo que nadie curó, que es la mayoría del árbol.
 *
 * No es una alternativa a ADR-004, es ADR-004 con un índice barato delante. El
 * modelo se carga en diferido: una consulta que resuelve la primera capa no
 * necesita ni tocarlo.
 */

export interface ActividadResuelta {
  cnae: string;
  descripcion: string;
  /** Empresas de esa clase, según el corpus. Ayuda a calibrar el segmento. */
  empresas: number;
  /** Comparable solo dentro de la misma respuesta, no entre consultas. */
  puntuacion: number;
  /** De dónde salió: útil para poder justificarlo. */
  via: "termino" | "semantica";
  /** El término curado que casó, si vino por ahí. */
  porQue?: string;
}

export interface Resolucion {
  consulta: string;
  actividades: ActividadResuelta[];
  /** `false` si no hay artefacto: entonces solo hubo términos curados. */
  conSemantica: boolean;
}

/** Lo que el motor necesita para vectorizar una consulta. */
export type Vectorizador = (texto: string) => Promise<Float32Array>;

let vectorizador: Vectorizador | undefined;

/**
 * Inyecta el vectorizador. Se hace desde fuera para que este paquete no arrastre
 * el runtime de ONNX a quien solo quiera los términos curados, y para poder
 * probarlo sin modelo.
 */
export function usarVectorizador(fn: Vectorizador | undefined): void {
  vectorizador = fn;
}

/** Carga perezosa del modelo local. Solo se paga si hace falta. */
export async function vectorizadorLocal(): Promise<Vectorizador> {
  const { pipeline } = await import("@huggingface/transformers");
  const extraer = await pipeline("feature-extraction", MODELO);
  return async (texto: string) => {
    const salida = await extraer([prefijoConsulta(texto)], {
      pooling: "mean",
      normalize: true,
    });
    return Float32Array.from(salida.data as Iterable<number>);
  };
}

const LIMITE_POR_DEFECTO = 5;

export async function resolverActividad(
  consulta: string,
  limite: number = LIMITE_POR_DEFECTO,
): Promise<Resolucion> {
  const limpia = normalizar(consulta);
  if (limpia.length < 3) {
    return { consulta, actividades: [], conSemantica: false };
  }

  const actividades: ActividadResuelta[] = [];
  const vistos = new Set<string>();

  for (const coincidencia of buscarLexico(consulta, limite)) {
    vistos.add(coincidencia.clase.codigo);
    actividades.push({
      ...aActividad(coincidencia.clase, coincidencia.puntuacion, "termino"),
      porQue: coincidencia.porQue,
    });
  }

  // Si los términos ya dieron de sobra, no se toca el modelo.
  const conSemantica = actividades.length < limite && vectorizador !== undefined;
  if (!conSemantica || !hayArtefacto()) {
    return { consulta, actividades: actividades.slice(0, limite), conSemantica: false };
  }

  const vector = await vectorizador!(consulta);
  const vecinos = masCercanos(vector, limite * 3);
  const mejor = vecinos[0]?.puntuacion ?? 0;

  for (const vecino of vecinos) {
    if (actividades.length >= limite) break;
    if (vistos.has(vecino.codigo)) continue;
    // Umbral RELATIVO al primero: los e5 comprimen la escala y un corte
    // absoluto dejaría fuera aciertos o colaría ruido según la consulta.
    if (vecino.puntuacion < mejor * MARGEN_RELATIVO) break;

    const clase = clasePorCodigo(vecino.codigo);
    if (!clase) continue;
    vistos.add(vecino.codigo);
    actividades.push(aActividad(clase, vecino.puntuacion, "semantica"));
  }

  return { consulta, actividades: actividades.slice(0, limite), conSemantica: true };
}

function aActividad(
  clase: ClaseCnae,
  puntuacion: number,
  via: ActividadResuelta["via"],
): ActividadResuelta {
  return {
    cnae: clase.codigo,
    descripcion: clase.etiqueta,
    empresas: clase.empresas,
    puntuacion,
    via,
  };
}

// ─── Recomendación de producto ────────────────────────────────────────────────

export interface ProductoRecomendado {
  sku: string;
  /** Por qué ese producto, en palabras que se le pueden repetir al usuario. */
  porQue: string;
  /** Otro producto que también encaja, normalmente más barato. */
  alternativa?: string;
  porQueAlternativa?: string;
  /** El caso curado del que sale, para poder auditar la recomendación. */
  caso: string;
  situacion: string;
  puntuacion: number;
}

const CASOS_POR_ID = new Map(casos.map((c) => [c.id, c]));

/**
 * Situación del cliente → producto de Infonif.
 *
 * Sale de los 50 casos curados, no del criterio del modelo. Importa
 * especialmente en lo que toca a crédito: la regla 5 dice que Nia no emite
 * recomendaciones de crédito, y los casos de ese tipo están escritos justo para
 * derivar al Informe de Riesgo en lugar de contestar.
 */
export async function recomendarProducto(
  situacion: string,
  limite = 3,
): Promise<ProductoRecomendado[]> {
  if (normalizar(situacion).length < 3) return [];
  if (!vectorizador || !hayArtefacto("casos")) return [];

  const vector = await vectorizador(situacion);
  const vecinos = masCercanos(vector, limite, "casos");
  const mejor = vecinos[0]?.puntuacion ?? 0;

  const recomendados: ProductoRecomendado[] = [];
  for (const vecino of vecinos) {
    if (vecino.puntuacion < mejor * MARGEN_RELATIVO) break;
    const caso = CASOS_POR_ID.get(vecino.codigo);
    if (!caso) continue;
    const recomendado: ProductoRecomendado = {
      sku: caso.sku,
      porQue: caso.porQue,
      caso: caso.id,
      situacion: caso.situacion,
      puntuacion: vecino.puntuacion,
    };
    if (caso.alternativa) recomendado.alternativa = caso.alternativa;
    if (caso.porQueAlternativa) recomendado.porQueAlternativa = caso.porQueAlternativa;
    recomendados.push(recomendado);
  }

  return recomendados;
}
