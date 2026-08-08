/**
 * Capa semántica: texto libre del usuario → códigos CNAE (ADR-004).
 *
 * Dos capas: términos comerciales curados a mano, y embeddings generados en
 * tiempo de compilación y cargados en memoria. La primera resuelve lo habitual
 * en microsegundos y se puede explicar; la segunda cubre el resto del árbol.
 *
 * Lo que NO se hace: pedirle los códigos CNAE al modelo de lenguaje. Se los
 * inventa con aplomo, y un CNAE inventado es un segmento mal contado y una
 * factura mal emitida.
 */
export {
  casos,
  corpus,
  clasePorCodigo,
  textoDeCaso,
  textoDeClase,
  type CasoComercial,
  type ClaseCnae,
  type Corpus,
} from "./corpus.js";
export { buscarLexico, normalizar, type CoincidenciaLexica } from "./lexico.js";
export { DIMENSIONES, MODELO } from "./modelo.js";
export {
  recomendarProducto,
  resolverActividad,
  usarVectorizador,
  vectorizadorLocal,
  type ActividadResuelta,
  type ProductoRecomendado,
  type Resolucion,
  type Vectorizador,
} from "./motor.js";
export {
  hayArtefacto,
  masCercanos,
  olvidarArtefacto,
  ArtefactoAusente,
} from "./vectores.js";
