import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import estilos from "./estilos.css?inline";
import { Widget } from "./Widget.js";
import type { ConfiguracionEmbebida } from "./tipos.js";

const ID_ANFITRION = "nia-anfitrion";

let raiz: Root | undefined;

/**
 * De dónde se ha cargado este script, sin el nombre del fichero.
 *
 * Se calcula AQUÍ, al evaluarse el módulo, porque es el único momento en que
 * `document.currentScript` vale algo: durante el render de React ya es `null` y
 * el respaldo acababa apuntando al origen del portal, que no es el del API.
 *
 * Y se queda con la ruta, no solo el origen: en el entorno de pruebas Nia cuelga
 * de un prefijo (`/nia/`) del mismo host que otro servicio, porque no había DNS
 * propio. Quedarse con el origen dejaba fuera ese prefijo.
 */
const BASE_DEL_SCRIPT: string | undefined = (() => {
  const actual = document.currentScript as HTMLScriptElement | null;
  if (!actual?.src) return undefined;
  try {
    const url = new URL(actual.src);
    return url.origin + url.pathname.replace(/\/[^/]*$/, "");
  } catch {
    return undefined;
  }
})();

/** La base del API cuando la página no la ha dicho. */
export function baseDelScript(): string | undefined {
  return BASE_DEL_SCRIPT;
}

/**
 * La configuración se lee en cada envío, no se congela al montar.
 *
 * El token de sesión dura 15 minutos, así que la página puede querer renovarlo
 * sin remontar el widget. Y en la demo llega por una llamada asíncrona que
 * termina después del montaje.
 */
export function configuracionActual(): ConfiguracionEmbebida {
  return window.__INFONIF_AGENT__ ?? {};
}

/**
 * Monta el widget dentro de un Shadow DOM propio.
 *
 * El aislamiento es el motivo de todo esto (ADR-006): el widget se inyecta en
 * páginas ASP con años de CSS encima, incluidas páginas de ranking con tráfico
 * orgánico. `mode: "open"` para poder depurar desde la consola.
 */
export function montar(): void {
  if (document.getElementById(ID_ANFITRION)) return;

  const anfitrion = document.createElement("div");
  anfitrion.id = ID_ANFITRION;
  document.body.appendChild(anfitrion);

  const sombra = anfitrion.attachShadow({ mode: "open" });

  // El CSS se inyecta como <style> dentro del shadow root: una hoja externa no
  // cruzaría el límite.
  const hoja = document.createElement("style");
  hoja.textContent = estilos;
  sombra.appendChild(hoja);

  const contenedor = document.createElement("div");
  contenedor.className = "nia-raiz";

  // Si la página pide otro anclaje, se aplica aquí y no en React: son variables
  // CSS que leen el lanzador y el cajón, y no cambian en toda la vida del
  // widget. Meterlas en el render solo añadiría un repintado.
  const posicion = configuracionActual().posicion;
  if (posicion?.derecha !== undefined) {
    contenedor.style.setProperty("--nia-pos-derecha", `${posicion.derecha}px`);
  }
  if (posicion?.abajo !== undefined) {
    contenedor.style.setProperty("--nia-pos-abajo", `${posicion.abajo}px`);
  }

  sombra.appendChild(contenedor);

  raiz = createRoot(contenedor);
  raiz.render(
    <StrictMode>
      <Widget />
    </StrictMode>,
  );
}

export function desmontar(): void {
  raiz?.unmount();
  raiz = undefined;
  document.getElementById(ID_ANFITRION)?.remove();
}

// Montaje automático: el ASP solo pone el <script async>, no llama a nada.
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montar, { once: true });
  } else {
    montar();
  }
}

export type { ConfiguracionEmbebida, ContextoPagina } from "./tipos.js";
