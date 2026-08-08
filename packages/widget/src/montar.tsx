import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import estilos from "./estilos.css?inline";
import { Widget } from "./Widget";
import type { ConfiguracionEmbebida } from "./tipos";

const ID_ANFITRION = "nia-anfitrion";

let raiz: Root | undefined;

/**
 * Monta el widget dentro de un Shadow DOM propio.
 *
 * El aislamiento es el motivo de todo esto (ADR-006): el widget se inyecta en
 * páginas ASP con años de CSS encima, incluidas páginas de ranking con tráfico
 * orgánico. `mode: "open"` para poder depurar desde la consola.
 */
export function montar(configuracion: ConfiguracionEmbebida = {}): void {
  if (document.getElementById(ID_ANFITRION)) return;

  const anfitrion = document.createElement("div");
  anfitrion.id = ID_ANFITRION;
  document.body.appendChild(anfitrion);

  const sombra = anfitrion.attachShadow({ mode: "open" });

  const hoja = document.createElement("style");
  hoja.textContent = estilos;
  sombra.appendChild(hoja);

  const contenedor = document.createElement("div");
  sombra.appendChild(contenedor);

  raiz = createRoot(contenedor);
  raiz.render(
    <StrictMode>
      <Widget configuracion={configuracion} />
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
  const arrancar = () => montar(window.__INFONIF_AGENT__ ?? {});
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  } else {
    arrancar();
  }
}
