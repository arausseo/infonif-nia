import { corpus, terminos, type ClaseCnae } from "./corpus.js";

/**
 * Primera pasada: coincidencia sobre los términos curados y las etiquetas.
 *
 * Resuelve en microsegundos, no necesita el modelo y —lo que más importa— es
 * **auditable**: se puede decir por qué salió ese CNAE, porque alguien escribió
 * ese término en `corpus/terminos.json`. Un vector no explica nada.
 *
 * Lo que esta capa no sabe, lo cubren los embeddings (`motor.ts`).
 */

export interface CoincidenciaLexica {
  clase: ClaseCnae;
  /** 1 si la consulta es exactamente un término curado; menos si es parcial. */
  puntuacion: number;
  /** El término que casó. Sirve para explicárselo al usuario. */
  porQue: string;
}

const DIACRITICOS = /\p{Diacritic}/gu;

export function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palabras que aparecen en casi cualquier petición de segmento y no distinguen
 * nada. Sin quitarlas, «empresas de mudanzas» casaría con cualquier cosa que
 * lleve «empresas».
 */
const VACIAS = new Set([
  "empresa",
  "empresas",
  "compania",
  "companias",
  "sociedad",
  "sociedades",
  "negocio",
  "negocios",
  "sector",
  "sectores",
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "y",
  "e",
  "o",
  "u",
  "en",
  "con",
  "para",
  "que",
  "se",
  "dedican",
  "dedicadas",
  "dedicada",
  "dedicado",
  "dediquen",
]);

function palabrasUtiles(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((p) => p.length > 2 && !VACIAS.has(p));
}

/**
 * Formas de una palabra que deben considerarse la misma.
 *
 * La gente escribe en plural —«talleres mecánicos», «clínicas dentales»— y los
 * términos están curados en singular. Sin esto, media curación no sirve de nada.
 *
 * No es un lematizador: es quitar la `s` y el `es` finales y quedarse con todas
 * las variantes, para que `envases` case tanto con `envase` como con `envas`.
 * Comparar conjuntos evita tener que acertar cuál es la raíz buena.
 */
function raices(palabra: string): string[] {
  const formas = [palabra];
  if (palabra.length > 3 && palabra.endsWith("s")) formas.push(palabra.slice(0, -1));
  if (palabra.length > 4 && palabra.endsWith("es")) formas.push(palabra.slice(0, -2));
  return formas;
}

function conjuntoDeRaices(palabras: readonly string[]): Set<string> {
  const conjunto = new Set<string>();
  for (const palabra of palabras) for (const raiz of raices(palabra)) conjunto.add(raiz);
  return conjunto;
}

/** Reduce una frase a su forma comparable: útiles, sin plural y ordenadas. */
function firma(texto: string): string {
  return palabrasUtiles(texto)
    .map((p) => raices(p).at(-1) ?? p)
    .sort()
    .join(" ");
}

interface Entrada {
  codigo: string;
  original: string;
}

/** término normalizado → clases que lo declaran */
const INDICE = new Map<string, Entrada[]>();
/** firma del término (sin plurales, ordenada) → clases */
const INDICE_FIRMA = new Map<string, Entrada[]>();

for (const [codigo, lista] of Object.entries(terminos)) {
  for (const termino of lista) {
    const entrada: Entrada = { codigo, original: termino };

    const clave = normalizar(termino);
    INDICE.set(clave, [...(INDICE.get(clave) ?? []), entrada]);

    const suFirma = firma(termino);
    if (suFirma.length > 0) {
      INDICE_FIRMA.set(suFirma, [...(INDICE_FIRMA.get(suFirma) ?? []), entrada]);
    }
  }
}

const POR_CODIGO = new Map(corpus.clases.map((c) => [c.codigo, c]));

/**
 * Busca la consulta entre los términos curados.
 *
 * Tres niveles, de más a menos fiable:
 *   1. la consulta normalizada ES un término curado
 *   2. algún término curado aparece entero dentro de la consulta
 *   3. las palabras útiles de la consulta coinciden con las de un término
 */
export function buscarLexico(consulta: string, limite = 8): CoincidenciaLexica[] {
  const clave = normalizar(consulta);
  if (clave.length === 0) return [];

  const marcador = new Map<string, CoincidenciaLexica>();

  const anotar = (codigo: string, puntuacion: number, porQue: string) => {
    const clase = POR_CODIGO.get(codigo);
    if (!clase) return;
    const previa = marcador.get(codigo);
    if (!previa || previa.puntuacion < puntuacion) {
      marcador.set(codigo, { clase, puntuacion, porQue });
    }
  };

  // 1. La consulta ES un término curado, letra por letra.
  for (const { codigo, original } of INDICE.get(clave) ?? []) {
    anotar(codigo, 1, original);
  }

  // 2. Lo mismo salvo plurales y palabras de relleno: «clínicas dentales».
  for (const { codigo, original } of INDICE_FIRMA.get(firma(consulta)) ?? []) {
    anotar(codigo, 0.95, original);
  }

  const palabras = palabrasUtiles(consulta);
  if (palabras.length === 0) return ordenar(marcador, limite);
  const raicesConsulta = conjuntoDeRaices(palabras);

  for (const [termino, entradas] of INDICE) {
    if (termino === clave) continue;

    // 3. El término curado aparece entero dentro de la consulta.
    if (termino.includes(" ") && clave.includes(termino)) {
      for (const { codigo, original } of entradas) anotar(codigo, 0.9, original);
      continue;
    }

    // 4. Solapamiento de palabras útiles, comparando por raíz.
    const suyas = termino.split(" ").filter((p) => p.length > 2 && !VACIAS.has(p));
    if (suyas.length === 0) continue;

    const comunes = suyas.filter((p) =>
      raices(p).some((raiz) => raicesConsulta.has(raiz)),
    ).length;
    if (comunes === 0) continue;

    const cobertura = comunes / suyas.length;
    // Un término de una sola palabra tiene que casar entero: «solar» no puede
    // colarse por «soldadura».
    if (suyas.length === 1 && cobertura < 1) continue;
    if (cobertura < 0.5) continue;

    for (const { codigo, original } of entradas) {
      anotar(codigo, 0.5 + 0.35 * cobertura, original);
    }
  }

  return ordenar(marcador, limite);
}

function ordenar(
  marcador: Map<string, CoincidenciaLexica>,
  limite: number,
): CoincidenciaLexica[] {
  return [...marcador.values()]
    .sort((a, b) => b.puntuacion - a.puntuacion || b.clase.empresas - a.clase.empresas)
    .slice(0, limite);
}
