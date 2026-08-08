import { ErrorInfonif } from "../../comun/errores.js";
import { cotizarListado, type Presupuesto } from "../precios.js";
import { infonif } from "./cliente.js";
import { armar, compilar, type FiltroSegmento, type Paso } from "./filtros.js";
import { obtenerEjerciciosRecientes, resolverProvincias } from "./resumen.js";
import { RespuestaFiltrar, type CampoDisponible } from "./tipos.js";

/**
 * Conteo y cotización de un segmento.
 *
 * El conteo del precio sale de `POST /buscador/filtrar`, que es exacto. Nunca de
 * una estimación (regla no negociable 7).
 */

const RUTA = "/buscador/filtrar?resumen=false";

export interface PasoEmbudo {
  criterio: Paso["criterio"];
  etiqueta: string;
  /** Empresas que quedan tras aplicar este criterio y todos los anteriores. */
  cantidad: number;
}

export interface Segmento {
  cantidad: number;
  embudo: PasoEmbudo[];
  camposDisponibles: CampoDisponible[];
  /** Provincias que el usuario nombró y no existen en el catálogo de Infonif. */
  provinciasNoResueltas: string[];
  /**
   * Empresas antes de exigir email o teléfono. Solo si se exigió alguno: sirve
   * para poder decir «de 275, 81 tienen email» en vez de aplicarlo callando.
   */
  cantidadSinRequisitoContacto?: number;
}

/** Lee la clave `filtro.{n-1}` de la respuesta, cuyo índice depende del embudo. */
function leerConteoDelPaso(cuerpo: Record<string, unknown>, indice: number): number {
  const entrada = cuerpo[`filtro.${indice}`];
  if (entrada && typeof entrada === "object" && "cantidad" in entrada) {
    const cantidad = (entrada as { cantidad: unknown }).cantidad;
    if (typeof cantidad === "number") return cantidad;
  }
  // Si no viene, el total del estado final sirve: es el mismo estado.
  const total = cuerpo["cantidad"];
  if (typeof total === "number") return total;
  throw new ErrorInfonif(0, RUTA, `respuesta sin filtro.${indice} ni cantidad`);
}

async function pedir(peticion: object): Promise<Record<string, unknown>> {
  const crudo = await infonif<Record<string, unknown>>(RUTA, { cuerpo: peticion });
  RespuestaFiltrar.parse(crudo);
  return crudo;
}

/**
 * Cuenta el segmento y devuelve el desglose por criterio.
 *
 * Su API solo devuelve el conteo del ÚLTIMO paso del embudo, así que para tener
 * el desglose completo hay que preguntar por cada prefijo. Se hacen en paralelo:
 * son independientes y así el desglose entero cuesta lo que la llamada más
 * lenta (~1,1 s), no la suma.
 */
export async function contarSegmento(filtro: FiltroSegmento): Promise<Segmento> {
  const [{ ids, noResueltas }, ejercicios] = await Promise.all([
    resolverProvincias(filtro.provincias ?? []),
    obtenerEjerciciosRecientes(),
  ]);
  const { pasos, camposRequeridos } = compilar(filtro, { provincias: ids, ejercicios });

  if (pasos.length === 0) {
    throw new ErrorInfonif(
      400,
      RUTA,
      "un segmento sin ningún criterio son 2,7+ millones de empresas",
    );
  }

  const prefijos = pasos.map((_, i) =>
    pedir(armar(pasos, camposRequeridos, i + 1)).then((cuerpo) => ({
      cuerpo,
      indice: i,
    })),
  );

  // El recuento sin exigir contacto es otra llamada más, y va en el mismo lote.
  const sinContacto = camposRequeridos.length > 0 ? pedir(armar(pasos, [])) : undefined;

  const [respuestas, respuestaSinContacto] = await Promise.all([
    Promise.all(prefijos),
    sinContacto,
  ]);

  const ultima = respuestas[respuestas.length - 1];
  if (!ultima) throw new ErrorInfonif(0, RUTA, "no se obtuvo ninguna respuesta");

  const segmento: Segmento = {
    cantidad: ultima.cuerpo["cantidad"] as number,
    embudo: respuestas.map(({ cuerpo, indice }) => ({
      criterio: pasos[indice]!.criterio,
      etiqueta: pasos[indice]!.etiqueta,
      cantidad: leerConteoDelPaso(cuerpo, indice),
    })),
    camposDisponibles: (ultima.cuerpo["campos_disponibles"] ?? []) as CampoDisponible[],
    provinciasNoResueltas: noResueltas,
  };

  if (respuestaSinContacto) {
    segmento.cantidadSinRequisitoContacto = respuestaSinContacto["cantidad"] as number;
  }

  return segmento;
}

/** Cuenta y cotiza en una sola pasada. Es lo que consume `construir_segmento`. */
export async function cotizarSegmento(
  filtro: FiltroSegmento,
  campos: readonly string[],
): Promise<{ segmento: Segmento; presupuesto: Presupuesto }> {
  const segmento = await contarSegmento(filtro);
  const presupuesto = cotizarListado(
    campos,
    segmento.camposDisponibles,
    segmento.cantidad,
  );
  return { segmento, presupuesto };
}
