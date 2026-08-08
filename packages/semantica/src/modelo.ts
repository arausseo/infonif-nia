/**
 * Qué modelo genera los vectores y cómo se le habla.
 *
 * `multilingual-e5-small` corre en la propia máquina por ONNX. 384 dimensiones,
 * ~120 MB de modelo, y la consulta del usuario no sale del servidor.
 *
 * Los e5 exigen prefijar el texto: `query:` para lo que se busca y `passage:`
 * para lo indexado. Sin los prefijos la calidad cae, y son asimétricos: si se
 * generan los pasajes con uno y se consulta con otro, todo se desordena.
 */
export const MODELO = "Xenova/multilingual-e5-small";

export const DIMENSIONES = 384;

export const prefijoConsulta = (texto: string): string => `query: ${texto}`;
export const prefijoPasaje = (texto: string): string => `passage: ${texto}`;

/**
 * Los e5 comprimen la escala: medido sobre este corpus, un acierto claro da
 * ~0,88 y algo totalmente ajeno ~0,845. **No se puede usar un umbral absoluto**;
 * lo que vale es el orden y la distancia respecto al primero.
 */
export const MARGEN_RELATIVO = 0.985;
