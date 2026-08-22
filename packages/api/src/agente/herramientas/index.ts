import type Anthropic from "@anthropic-ai/sdk";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Herramienta } from "../tipos.js";
import buscarEmpresa from "./buscar_empresa.js";
import comparaEmpresas from "./comparar_empresas.js";
import construirSegmento from "./construir_segmento.js";
import consultarActosBorme from "./consultar_actos_borme.js";
import consultarBalance from "./consultar_balance.js";
import consultarCargos from "./consultar_cargos.js";
import consultarCreditos from "./consultar_creditos.js";
import consultarDepositosDisponibles from "./consultar_depositos_disponibles.js";
import consultarEmpresasGrupo from "./consultar_empresas_grupo.js";
import consultarRai from "./consultar_rai.js";
import consultarSocios from "./consultar_socios.js";
import consultarTitularidadReal from "./consultar_titularidad_real.js";
import descargarCuentasAnuales from "./descargar_cuentas_anuales.js";
import consultarSaldo from "./consultar_saldo.js";
import cotizar from "./cotizar.js";
import obtenerFichaPublica from "./obtener_ficha_publica.js";
import obtenerMagnitudes from "./obtener_magnitudes.js";
import recomendarProducto from "./recomendar_producto.js";
import resolverActividad from "./resolver_actividad.js";

/**
 * El registro: una definición por archivo, y de ahí salen el JSON Schema que ve
 * el modelo, el validador y el mapa de despacho (CONTRATOS §2).
 */

export const HERRAMIENTAS: readonly Herramienta[] = [
  buscarEmpresa,
  obtenerFichaPublica,
  obtenerMagnitudes,
  resolverActividad,
  construirSegmento,
  comparaEmpresas,

  // Familia /dato del gateway. Van juntas y al final a propósito: comparten
  // credencial, comparten coste (1 crédito por NIF y mes) y comparten la forma
  // de fallar. Lo que las une no es el tema, es de dónde salen.
  consultarCargos,
  consultarBalance,
  consultarActosBorme,
  consultarEmpresasGrupo,
  consultarDepositosDisponibles,

  // Familia /producto: entregan lo que el cliente ya compró en el portal. NO
  // cobran —el cobro fue en la web— pero pueden responder «no contratado», que
  // es una tercera moneda distinta de los créditos y de los registros.
  consultarRai,
  descargarCuentasAnuales,

  // Datos de personas físicas. Van al final y juntas para que se vea de un
  // vistazo cuáles son: sus descripciones piden explícitamente que no se
  // consulten salvo que el usuario lo pida.
  consultarSocios,
  consultarTitularidadReal,
  consultarCreditos,

  consultarSaldo,
  recomendarProducto,
  cotizar,
];

const POR_NOMBRE = new Map(HERRAMIENTAS.map((h) => [h.nombre, h]));

export function herramientaPorNombre(nombre: string): Herramienta | undefined {
  return POR_NOMBRE.get(nombre);
}

/** Texto del `status` que se emite en cuanto el modelo nombra la herramienta. */
export const COPY: Record<string, string> = Object.fromEntries(
  HERRAMIENTAS.map((h) => [h.nombre, h.progreso]),
);

/**
 * Las herramientas tal como las ve el modelo.
 *
 * Se calcula una vez: el bloque tiene que ser byte a byte idéntico entre turnos
 * para que la caché de prompt sirva de algo.
 */
export const HERRAMIENTAS_PARA_EL_MODELO: Anthropic.Tool[] = HERRAMIENTAS.map((h) => {
  const esquema = zodToJsonSchema(h.esquema, {
    $refStrategy: "none",
    target: "jsonSchema7",
  }) as Anthropic.Tool.InputSchema;

  return {
    name: h.nombre,
    description: h.descripcion,
    input_schema: esquema,
  };
});
