/**
 * Genera los artefactos binarios de embeddings del corpus (ADR-004).
 *
 *   pnpm embeddings
 *
 * Dos corpus, dos artefactos:
 *   - `cnae.bin`  → las 627 clases CNAE, para resolver actividad
 *   - `casos.bin` → los 50 casos comerciales, para recomendar producto
 *
 * Cada uno es un `.bin` plano de Float32 con los vectores seguidos, más un JSON
 * con el orden de los identificadores y con qué modelo se generó. Se versionan:
 * así un despliegue no tiene que rehacerlos.
 *
 * El modelo corre en la máquina, no en un tercero: el corpus es público pero la
 * consulta del usuario no, y no sacarla del servidor ahorra una conversación de
 * RGPD con Infonif.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { pipeline } from "@huggingface/transformers";
import { casos, corpus, textoDeCaso, textoDeClase } from "../src/corpus.js";
import { DIMENSIONES, MODELO, prefijoPasaje } from "../src/modelo.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const carpeta = resolve(aqui, "../artefactos");
mkdirSync(carpeta, { recursive: true });

console.log(`Cargando ${MODELO}… (la primera vez se descarga, ~120 MB)`);
const arranque = Date.now();
const extraer = await pipeline("feature-extraction", MODELO);
console.log(`  listo en ${((Date.now() - arranque) / 1000).toFixed(1)} s`);

async function vectorizar(
  nombre: string,
  identificadores: string[],
  textos: string[],
): Promise<void> {
  console.log(`\nVectorizando ${textos.length} documentos de ${nombre}…`);
  const inicio = Date.now();
  const salida = await extraer(textos.map(prefijoPasaje), {
    pooling: "mean",
    normalize: true,
  });
  console.log(`  ${((Date.now() - inicio) / 1000).toFixed(1)} s`);

  const [filas, dimensiones] = salida.dims as [number, number];
  if (filas !== identificadores.length) {
    throw new Error(
      `Se esperaban ${identificadores.length} vectores y salieron ${filas}`,
    );
  }
  if (dimensiones !== DIMENSIONES) {
    throw new Error(
      `El modelo devuelve ${dimensiones} dimensiones y src/modelo.ts dice ${DIMENSIONES}`,
    );
  }

  const vectores = Float32Array.from(salida.data as Iterable<number>);
  writeFileSync(resolve(carpeta, `${nombre}.bin`), Buffer.from(vectores.buffer));
  writeFileSync(
    resolve(carpeta, `${nombre}.meta.json`),
    `${JSON.stringify(
      {
        modelo: MODELO,
        dimensiones,
        generadoEn: new Date().toISOString().slice(0, 10),
        corpusGeneradoEn: corpus.generadoEn,
        // El orden importa: es el que indexa el .bin.
        codigos: identificadores,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const kb = (vectores.byteLength / 1024).toFixed(0);
  console.log(`  ${nombre}.bin — ${filas} × ${dimensiones} = ${kb} KB`);
}

await vectorizar(
  "cnae",
  corpus.clases.map((c) => c.codigo),
  corpus.clases.map(textoDeClase),
);

await vectorizar(
  "casos",
  casos.map((c) => c.id),
  casos.map(textoDeCaso),
);

console.log(`\nArtefactos en ${carpeta}`);
