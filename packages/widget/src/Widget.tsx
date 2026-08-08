import { useState } from "react";
import type { ConfiguracionEmbebida } from "./tipos";

/** La N de Nia: tres barras ascendentes que leídas de otro modo son crecimiento. */
function IconoNia() {
  return (
    <svg className="nia-icono" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <rect x="1" y="10" width="4" height="7" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="7" y="6" width="4" height="11" rx="1" fill="currentColor" opacity="0.8" />
      <rect x="13" y="1" width="4" height="16" rx="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Carcasa mínima de la Fase 0: demuestra que el montaje en Shadow DOM aísla los
 * estilos en ambos sentidos. La conversación, la línea de tiempo de pasos y el
 * registro de tarjetas son Fase 4 (PLAN.md).
 */
export function Widget({ configuracion }: { configuracion: ConfiguracionEmbebida }) {
  const [abierto, setAbierto] = useState(false);
  const contexto = configuracion.contexto;

  return (
    <>
      {abierto && (
        <section className="nia-panel" aria-label="Nia, asistente de Infonif">
          <h2>Nia</h2>
          <p>
            Andamiaje montado en Shadow DOM. El CSS del portal no entra y el de Nia no
            sale.
          </p>
          <p>
            Contexto de página:{" "}
            <code>
              {contexto
                ? `${contexto.tipo}${contexto.nif ? ` · ${contexto.nif}` : ""}`
                : "ninguno"}
            </code>
          </p>
          <p>
            Sesión: <code>{configuracion.token ? "token recibido" : "anónima"}</code>
          </p>
        </section>
      )}

      <button
        className="nia-lanzador"
        onClick={() => setAbierto((estaba) => !estaba)}
        aria-expanded={abierto}
      >
        <IconoNia />
        Nia
        <span className="nia-insignia">BETA</span>
      </button>
    </>
  );
}
