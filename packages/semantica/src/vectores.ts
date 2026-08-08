import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DIMENSIONES } from "./modelo.js";

/**
 * El artefacto de embeddings, en memoria, y la búsqueda por fuerza bruta.
 *
 * 627 × 384 floats son 963 KB: cabe de sobra y recorrerlo entero cuesta menos de
 * un milisegundo. No hace falta índice ni base de datos vectorial (ADR-004).
 *
 * Los vectores vienen ya normalizados del generador, así que el coseno es un
 * producto escalar y nada más.
 */

export interface Artefacto {
  modelo: string;
  dimensiones: number;
  generadoEn: string;
  corpusGeneradoEn: string;
  codigos: string[];
}

const aqui = dirname(fileURLToPath(import.meta.url));
const carpeta = resolve(aqui, "../artefactos");

const cargados = new Map<string, { vectores: Float32Array; meta: Artefacto }>();

export class ArtefactoAusente extends Error {
  constructor() {
    super(
      "No hay artefacto de embeddings. Genéralo con `pnpm embeddings`. " +
        "Mientras tanto, la resolución de actividad funciona solo con los términos curados.",
    );
    this.name = "ArtefactoAusente";
  }
}

/** Carga el artefacto. Lanza `ArtefactoAusente` si no se ha generado. */
export function cargarArtefacto(nombre = "cnae"): {
  vectores: Float32Array;
  meta: Artefacto;
} {
  const ya = cargados.get(nombre);
  if (ya) return ya;

  let crudo: Buffer;
  let metaCruda: string;
  try {
    crudo = readFileSync(resolve(carpeta, `${nombre}.bin`));
    metaCruda = readFileSync(resolve(carpeta, `${nombre}.meta.json`), "utf8");
  } catch {
    throw new ArtefactoAusente();
  }

  const meta = JSON.parse(metaCruda) as Artefacto;
  const vectores = new Float32Array(
    crudo.buffer.slice(crudo.byteOffset, crudo.byteOffset + crudo.byteLength),
  );

  const esperados = meta.codigos.length * meta.dimensiones;
  if (vectores.length !== esperados) {
    throw new Error(
      `El artefacto no cuadra: ${vectores.length} floats para ${meta.codigos.length} códigos de ${meta.dimensiones} dimensiones`,
    );
  }
  if (meta.dimensiones !== DIMENSIONES) {
    throw new Error(
      `El artefacto es de ${meta.dimensiones} dimensiones y el modelo actual da ${DIMENSIONES}. Regenera con \`pnpm embeddings\`.`,
    );
  }

  const cargado = { vectores, meta };
  cargados.set(nombre, cargado);
  return cargado;
}

export function hayArtefacto(nombre = "cnae"): boolean {
  try {
    cargarArtefacto(nombre);
    return true;
  } catch {
    return false;
  }
}

/** Solo para tests. */
export function olvidarArtefacto(): void {
  cargados.clear();
}

export interface Vecino {
  codigo: string;
  puntuacion: number;
}

/**
 * Los `limite` vectores más cercanos, por fuerza bruta.
 *
 * Con ambos lados normalizados, el coseno es el producto escalar. Se recorre el
 * array plano sin cortarlo en trozos: crear 627 subarrays costaría más que la
 * propia multiplicación.
 */
export function masCercanos(
  consulta: Float32Array,
  limite = 8,
  nombre = "cnae",
): Vecino[] {
  const { vectores: V, meta: m } = cargarArtefacto(nombre);
  const d = m.dimensiones;

  if (consulta.length !== d) {
    throw new Error(
      `La consulta tiene ${consulta.length} dimensiones y el artefacto ${d}`,
    );
  }

  const marcador: Vecino[] = [];
  for (let i = 0; i < m.codigos.length; i++) {
    const base = i * d;
    let producto = 0;
    for (let j = 0; j < d; j++) producto += consulta[j]! * V[base + j]!;
    marcador.push({ codigo: m.codigos[i]!, puntuacion: producto });
  }

  return marcador.sort((a, b) => b.puntuacion - a.puntuacion).slice(0, limite);
}
