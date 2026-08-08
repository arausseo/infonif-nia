import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Carga del corpus: las 627 clases CNAE que publica Infonif, más los términos
 * comerciales curados a mano.
 *
 * El corpus se genera con `pnpm --filter @nia/semantica corpus` y se versiona:
 * son sus etiquetas y sus códigos, y cambian poco.
 */

export interface ClaseCnae {
  codigo: string;
  etiqueta: string;
  empresas: number;
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

const aqui = dirname(fileURLToPath(import.meta.url));

function leer<T>(ruta: string): T {
  return JSON.parse(readFileSync(resolve(aqui, "..", ruta), "utf8")) as T;
}

export const corpus: Corpus = leer<Corpus>("corpus/cnae.json");

export const terminos: Record<string, string[]> = leer<{
  terminos: Record<string, string[]>;
}>("corpus/terminos.json").terminos;

/**
 * El texto que se vectoriza de cada clase.
 *
 * No es solo la etiqueta oficial: se le cosen el grupo, la división y los
 * términos comerciales. Sin ese contexto, «logística» no se parece a
 * «Transporte de mercancías por carretera», porque la palabra no aparece en
 * ninguna parte del árbol del CNAE.
 */
export function textoDeClase(clase: ClaseCnae): string {
  return [
    clase.etiqueta,
    clase.grupo.etiqueta,
    clase.division.etiqueta,
    ...(terminos[clase.codigo] ?? []),
  ]
    .filter(Boolean)
    .join(". ");
}

export function clasePorCodigo(codigo: string): ClaseCnae | undefined {
  return indicePorCodigo.get(codigo);
}

const indicePorCodigo = new Map(corpus.clases.map((c) => [c.codigo, c]));

// ─── Casos comerciales ────────────────────────────────────────────────────────

export interface CasoComercial {
  id: string;
  /** Cómo lo cuenta el cliente, con sus palabras. */
  situacion: string;
  sku: string;
  porQue: string;
  alternativa?: string;
  porQueAlternativa?: string;
}

export const casos: CasoComercial[] = leer<{ casos: CasoComercial[] }>(
  "corpus/casos-comerciales.json",
).casos;

/** Lo que se vectoriza de un caso: cómo lo diría el cliente. */
export function textoDeCaso(caso: CasoComercial): string {
  return caso.situacion;
}
