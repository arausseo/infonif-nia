import { useEffect, useState } from "react";
import { estadoDeLaLinea, resumenDeLaLinea } from "../estado/turno.js";
import type { Turno } from "../tipos.js";

/**
 * La línea de tiempo de pasos (CONTRATOS §6).
 *
 * Tres estados:
 *   - **durante**: expandida, con el paso en curso girando
 *   - **hecho**: colapsada a «3 pasos · 1,2 s», con chevron para abrirla
 *   - **error**: abierta, para que se vea dónde se rompió
 *
 * **Sin animación de salida.** Animar el colapso produce saltos de layout justo
 * mientras el texto se está transmitiendo debajo, y se ve peor que un cambio
 * seco.
 *
 * Los pasos NO llevan `aria-live`: un lector de pantalla que cante cinco
 * cambios de estado seguidos es inservible. Lo que se anuncia es la respuesta.
 */
export function LineaDeTiempo({ turno }: { turno: Turno }) {
  const estado = estadoDeLaLinea(turno);
  const [abierta, setAbierta] = useState(true);

  // Al terminar bien, se colapsa. Si hay error, se queda abierta.
  useEffect(() => {
    if (estado === "hecho") setAbierta(false);
    if (estado === "error") setAbierta(true);
  }, [estado]);

  // Sin pasos y sin turno en curso no hay nada que enseñar. PERO si el turno
  // está en curso sí: entre que se envía y llega el primer paso pasan casi tres
  // segundos —el modelo tiene que leer el prompt entero y decidir qué
  // herramienta usar— y durante ese rato la pantalla se quedaba muerta. El
  // `inicio` del stream llega a los ~450 ms; esto es lo que lo aprovecha.
  if (turno.pasos.length === 0 && !turno.enCurso) return null;

  const desplegable = estado !== "durante";

  return (
    <div className={`nia-pasos nia-pasos--${estado}`} aria-busy={turno.enCurso}>
      <button
        type="button"
        className="nia-pasos__resumen"
        onClick={() => desplegable && setAbierta((antes) => !antes)}
        aria-expanded={abierta}
        disabled={!desplegable}
      >
        <span className="nia-pasos__titulo">
          {/*
            El giro solo mientras no hay pasos. En cuanto llega el primero, el
            suyo toma el relevo — dos cosas girando a la vez es ruido.
          */}
          {estado === "durante" && turno.pasos.length === 0 && (
            <span className="nia-spinner" aria-hidden="true" />
          )}
          {estado === "durante" ? "Trabajando…" : resumenDeLaLinea(turno)}
        </span>
        {desplegable && (
          <span
            className={`nia-chevron ${abierta ? "nia-chevron--abierto" : ""}`}
            aria-hidden="true"
          >
            ›
          </span>
        )}
      </button>

      {abierta && turno.pasos.length > 0 && (
        <ol className="nia-pasos__lista">
          {turno.pasos.map((paso) => (
            <li key={paso.id} className={`nia-paso nia-paso--${paso.estado}`}>
              <span className="nia-paso__marca" aria-hidden="true">
                {paso.estado === "activo" ? (
                  <span className="nia-spinner" />
                ) : paso.estado === "ok" ? (
                  "✓"
                ) : (
                  "✗"
                )}
              </span>
              <span className="nia-paso__texto">{paso.texto}</span>
              {paso.detalle && <span className="nia-paso__detalle">{paso.detalle}</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
