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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { casos, corpus, textoDeCaso, textoDeClase } from "../src/corpus.js";
import { DIMENSIONES, MODELO, prefijoPasaje } from "../src/modelo.js";

const aqui = dirname(fileURLToPath(import.meta.url));
const carpeta = resolve(aqui, "../artefactos");
mkdirSync(carpeta, { recursive: true });

const forzar = process.argv.includes("--forzar");

/**
 * ¿Hace falta rehacer este artefacto?
 *
 * Los `.bin` están versionados, así que en un despliegue normal la respuesta es
 * que no. Regenerarlos igualmente costó un despliegue: en una máquina de 2 GB el
 * OOM killer se llevó el proceso por delante (exit 137) vectorizando las 627
 * clases del CNAE, y lo hizo para producir exactamente los mismos ficheros que
 * ya estaban en el árbol.
 *
 * Se comparan las cuatro cosas que invalidan un artefacto: el modelo, las
 * dimensiones, la fecha del corpus y la lista de identificadores —esta última
 * porque el corpus puede cambiar de contenido sin cambiar de fecha—.
 */
function estaAlDia(nombre: string, identificadores: readonly string[]): boolean {
  const bin = resolve(carpeta, `${nombre}.bin`);
  const meta = resolve(carpeta, `${nombre}.meta.json`);
  if (!existsSync(bin) || !existsSync(meta)) return false;

  try {
    const previo = JSON.parse(readFileSync(meta, "utf8")) as {
      modelo?: string;
      dimensiones?: number;
      corpusGeneradoEn?: string;
      codigos?: string[];
    };

    if (previo.modelo !== MODELO) return false;
    if (previo.dimensiones !== DIMENSIONES) return false;
    if (previo.corpusGeneradoEn !== corpus.generadoEn) return false;
    if (previo.codigos?.length !== identificadores.length) return false;
    if (previo.codigos.some((codigo, i) => codigo !== identificadores[i])) return false;

    // Y que el .bin tenga el tamaño que dicen esos metadatos, por si quedó a
    // medias una generación anterior.
    const esperado = identificadores.length * DIMENSIONES * 4;
    return readFileSync(bin).byteLength === esperado;
  } catch {
    return false;
  }
}

type Trabajo = { nombre: string; identificadores: string[]; textos: string[] };

const TRABAJOS: Trabajo[] = [
  {
    nombre: "cnae",
    identificadores: corpus.clases.map((c) => c.codigo),
    textos: corpus.clases.map(textoDeClase),
  },
  {
    nombre: "casos",
    identificadores: casos.map((c) => c.id),
    textos: casos.map(textoDeCaso),
  },
];

const pendientes = forzar
  ? TRABAJOS
  : TRABAJOS.filter((t) => !estaAlDia(t.nombre, t.identificadores));

if (pendientes.length === 0) {
  console.log(
    "Los artefactos están al día; no se regenera nada.\n" +
      "  (`pnpm embeddings --forzar` los rehace de todas formas.)",
  );
  process.exit(0);
}

console.log(`Hay que regenerar: ${pendientes.map((t) => t.nombre).join(", ")}`);
console.log("Necesita ~4 GB de memoria. Con menos, el sistema mata el proceso.\n");

// El modelo se carga AQUÍ, no antes: si no hay nada que hacer, no se descargan
// 120 MB ni se esperan 18 segundos para nada.
const { pipeline } = await import("@huggingface/transformers");

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

for (const trabajo of pendientes) {
  await vectorizar(trabajo.nombre, trabajo.identificadores, trabajo.textos);
}

console.log(`\nArtefactos en ${carpeta}`);
