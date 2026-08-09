import { useEffect, useMemo, useRef, useState } from "react";
import { Lanzador, type EstadoIcono } from "./componentes/Lanzador.js";
import { LineaDeTiempo } from "./componentes/LineaDeTiempo.js";
import { Markdown } from "./componentes/Markdown.js";
import { Sugerencias } from "./componentes/Sugerencias.js";
import { Tarjetas } from "./componentes/tarjetas/index.js";
import { useAltoAutomatico } from "./ganchos/useAltoAutomatico.js";
import { useAutoscroll } from "./ganchos/useAutoscroll.js";
import { useConversacion } from "./ganchos/useConversacion.js";
import { useThrottle } from "./ganchos/useThrottle.js";
import { configuracionActual } from "./montar.js";
import type { Turno } from "./tipos.js";

/**
 * La carcasa: lanzador + cajón.
 *
 * Todo esto vive dentro de un Shadow DOM (ADR-006), así que ni hereda el CSS del
 * portal ni se lo impone.
 */
export function Widget() {
  const configuracion = configuracionActual();
  const [abierto, setAbierto] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const [borrador, setBorrador] = useState("");
  const entrada = useRef<HTMLTextAreaElement | null>(null);

  // La caja de texto crece con lo que se escribe; el tope lo pone el CSS.
  useAltoAutomatico(entrada, borrador);

  const { turnos, enviar, enviando, cancelar, reiniciar } =
    useConversacion(configuracion);
  const ultimo = turnos[turnos.length - 1];

  const { referencia, alDesplazar, hayNuevo, irAlFondo } = useAutoscroll<HTMLDivElement>(
    ultimo?.texto.length ?? 0 + (ultimo?.pasos.length ?? 0),
  );

  const estadoIcono: EstadoIcono = useMemo(() => {
    if (!enviando) return turnos.length === 0 ? "sugerencia" : "reposo";
    return ultimo && ultimo.texto.length > 0 ? "respondiendo" : "analizando";
  }, [enviando, turnos.length, ultimo]);

  useEffect(() => {
    if (abierto) entrada.current?.focus();
  }, [abierto]);

  // Escape cierra el cajón, que es lo que espera cualquiera.
  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAbierto(false);
    };
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [abierto]);

  const mandar = (texto: string) => {
    setBorrador("");
    void enviar(texto);
  };

  return (
    <>
      {abierto && (
        <section
          className={`nia-cajon ${pantallaCompleta ? "nia-cajon--completo" : ""}`}
          aria-label="Nia, asistente de Infonif"
        >
          <header className="nia-cajon__cabecera">
            <span className="nia-cajon__titulo">
              Nia <span className="nia-insignia">BETA</span>
            </span>
            <div className="nia-cajon__acciones">
              {turnos.length > 0 && (
                <button
                  type="button"
                  className="nia-boton-icono"
                  onClick={reiniciar}
                  title="Empezar de nuevo"
                >
                  ⟲
                </button>
              )}
              <button
                type="button"
                className="nia-boton-icono"
                onClick={() => setPantallaCompleta((antes) => !antes)}
                title={pantallaCompleta ? "Reducir" : "Pantalla completa"}
              >
                {pantallaCompleta ? "⤡" : "⤢"}
              </button>
              <button
                type="button"
                className="nia-boton-icono"
                onClick={() => setAbierto(false)}
                title="Cerrar"
              >
                ✕
              </button>
            </div>
          </header>

          <div className="nia-cajon__cuerpo" ref={referencia} onScroll={alDesplazar}>
            {turnos.length === 0 ? (
              <Sugerencias
                {...(configuracion.contexto ? { contexto: configuracion.contexto } : {})}
                onElegir={mandar}
              />
            ) : (
              turnos.map((turno) => <TurnoVisto key={turno.id} turno={turno} />)
            )}
          </div>

          {hayNuevo && (
            <button type="button" className="nia-pildora" onClick={irAlFondo}>
              ↓ nuevo
            </button>
          )}

          <form
            className="nia-compositor"
            onSubmit={(evento) => {
              evento.preventDefault();
              mandar(borrador);
            }}
          >
            <textarea
              ref={entrada}
              className="nia-compositor__entrada"
              value={borrador}
              rows={1}
              placeholder="Pregunta por una empresa o describe el listado que buscas"
              onChange={(evento) => setBorrador(evento.target.value)}
              onKeyDown={(evento) => {
                // Enter envía; Mayús+Enter hace salto de línea.
                if (evento.key === "Enter" && !evento.shiftKey) {
                  evento.preventDefault();
                  mandar(borrador);
                }
              }}
            />
            {enviando ? (
              <button type="button" className="nia-compositor__boton" onClick={cancelar}>
                Parar
              </button>
            ) : (
              <button
                type="submit"
                className="nia-compositor__boton"
                disabled={borrador.trim().length === 0}
              >
                Enviar
              </button>
            )}
          </form>
        </section>
      )}

      <Lanzador
        abierto={abierto}
        estado={estadoIcono}
        onClick={() => setAbierto((antes) => !antes)}
      />
    </>
  );
}

function TurnoVisto({ turno }: { turno: Turno }) {
  // El markdown se repinta como mucho cada 50 ms, no en cada token.
  const texto = useThrottle(turno.texto, 50);

  return (
    <div className="nia-turno">
      {turno.pregunta && <p className="nia-pregunta">{turno.pregunta}</p>}

      <LineaDeTiempo turno={turno} />

      {texto.length > 0 && (
        // `aria-live` SOLO aquí: en los pasos convertiría al lector de pantalla
        // en una ametralladora.
        <div className="nia-respuesta" aria-live="polite">
          <Markdown texto={texto} />
        </div>
      )}

      <Tarjetas tarjetas={turno.tarjetas} />

      {turno.error && <p className="nia-error">{turno.error}</p>}
    </div>
  );
}
