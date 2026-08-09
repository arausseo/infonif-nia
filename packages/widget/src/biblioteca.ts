/**
 * Los componentes, sueltos y sin efectos secundarios.
 *
 * Esto NO es lo que embebe el portal: para eso está `montar.tsx`, que además de
 * exportar funciones **se auto-monta al importarse**. Importar aquello para
 * quedarse con una pieza planta un shadow host en `document.body` y arranca el
 * cajón entero.
 *
 * Este punto de entrada existe para lo contrario: renderizar componentes
 * aislados —en el design system, en un test, en otra aplicación— sin que pase
 * nada más. Todo lo de aquí se gobierna por props y ninguno habla con la red.
 *
 * Quien los use tiene que envolverlos en `RaizNia` y cargar `estilos.css`: los
 * tokens cuelgan de `.nia-raiz` y sin esa clase los componentes salen sin
 * estilo.
 *
 * `Widget` no se exporta a propósito. Abre un flujo SSE en cuanto se monta, así
 * que fuera de una conversación real no tiene nada que enseñar.
 */

export { RaizNia } from "./componentes/RaizNia.js";
export { IconoNia, Lanzador, type EstadoIcono } from "./componentes/Lanzador.js";
export { LineaDeTiempo } from "./componentes/LineaDeTiempo.js";
export { Markdown } from "./componentes/Markdown.js";
export { Sugerencias, sugerenciasDe } from "./componentes/Sugerencias.js";
export { Tarjetas } from "./componentes/tarjetas/index.js";
export { TarjetaSegmento } from "./componentes/tarjetas/TarjetaSegmento.js";
export { TarjetaFicha } from "./componentes/tarjetas/TarjetaFicha.js";
export { TarjetaBloqueado } from "./componentes/tarjetas/TarjetaBloqueado.js";

export type { ContextoPagina, Paso, Tarjeta, Turno } from "./tipos.js";
