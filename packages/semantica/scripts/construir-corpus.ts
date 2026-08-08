/**
 * Extrae el corpus CNAE del resumen en vivo de Infonif y lo versiona.
 *
 *   pnpm --filter @nia/semantica corpus
 *
 * Por qué de su API y no de un CNAE-2009 público: son **sus** etiquetas, con
 * **sus** conteos, y son exactamente los códigos que su filtro acepta. Un corpus
 * externo tendría clases que ellos no indexan y viceversa.
 *
 * Solo se indexan las clases de cuatro dígitos, que es el nivel con el que se
 * filtra de verdad. Las etiquetas de sección, división y grupo no son documentos
 * aparte: se cosen al texto de cada clase como contexto, que es lo que hace que
 * «logística» se parezca a «Transporte de mercancías por carretera» aunque la
 * palabra no aparezca en la etiqueta.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config as cargarDotenv } from "dotenv";

cargarDotenv({ path: [".env", "../../.env"] });

const API = process.env["INFONIF_API_URL"] ?? "https://bbdd-api.infonif.es/api";
const CLAVE = process.env["INFONIF_API_KEY"] ?? "";

interface Nodo {
  id: string;
  label: string;
  data: number;
  children?: Nodo[] | null;
}

export interface ClaseCnae {
  /** Código de cuatro dígitos, tal cual lo espera `sector_actividad: cnae|NNNN`. */
  codigo: string;
  etiqueta: string;
  /** Empresas en esa clase, según el resumen del día que se generó. */
  empresas: number;
  /** Sección (letra), división (2 dígitos) y grupo (3 dígitos) a los que cuelga. */
  seccion: { id: string; etiqueta: string };
  division: { id: string; etiqueta: string };
  grupo: { id: string; etiqueta: string };
}

export interface Corpus {
  generadoEn: string;
  universo: number;
  clases: ClaseCnae[];
  sectores: { etiqueta: string; empresas: number }[];
}

async function descargarResumen(): Promise<{
  cantidad: number;
  cnae: Nodo[];
  industria: Nodo[];
}> {
  const respuesta = await fetch(`${API}/buscador/resumen`, {
    headers: CLAVE ? { apikey: CLAVE } : {},
    signal: AbortSignal.timeout(90_000),
  });
  if (!respuesta.ok) {
    throw new Error(`El resumen respondió ${respuesta.status}`);
  }
  return respuesta.json() as Promise<{
    cantidad: number;
    cnae: Nodo[];
    industria: Nodo[];
  }>;
}

function aplanar(secciones: readonly Nodo[]): ClaseCnae[] {
  const clases: ClaseCnae[] = [];

  for (const seccion of secciones) {
    for (const division of seccion.children ?? []) {
      for (const grupo of division.children ?? []) {
        for (const clase of grupo.children ?? []) {
          if (!/^\d{4}$/.test(clase.id)) continue;
          clases.push({
            codigo: clase.id,
            etiqueta: clase.label,
            empresas: clase.data,
            seccion: { id: seccion.id, etiqueta: seccion.label },
            division: { id: division.id, etiqueta: division.label },
            grupo: { id: grupo.id, etiqueta: grupo.label },
          });
        }
      }
    }
  }

  return clases.sort((a, b) => a.codigo.localeCompare(b.codigo));
}

const aqui = dirname(fileURLToPath(import.meta.url));
const destino = resolve(aqui, "../corpus/cnae.json");

const resumen = await descargarResumen();
const clases = aplanar(resumen.cnae);

if (clases.length < 600) {
  throw new Error(`Solo ${clases.length} clases: el resumen no trae el árbol completo`);
}

const corpus: Corpus = {
  // Solo la fecha: el corpus cambia de un día para otro, no de una hora a otra,
  // y una marca con hora produciría diffs falsos en cada regeneración.
  generadoEn: new Date().toISOString().slice(0, 10),
  universo: resumen.cantidad,
  clases,
  sectores: resumen.industria
    .map((s) => ({ etiqueta: s.label, empresas: s.data }))
    .sort((a, b) => b.empresas - a.empresas),
};

writeFileSync(destino, `${JSON.stringify(corpus, null, 2)}\n`, "utf8");

console.log(`Corpus escrito en ${destino}`);
console.log(`  ${corpus.clases.length} clases CNAE de 4 dígitos`);
console.log(`  ${corpus.sectores.length} sectores Infonif`);
console.log(`  universo: ${corpus.universo.toLocaleString("es-ES")} empresas`);
