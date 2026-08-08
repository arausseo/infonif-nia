/**
 * El lanzador (ADR-010).
 *
 * La marca es una N construida con tres barras ascendentes que, leídas de otro
 * modo, son un gráfico de crecimiento.
 *
 * Cuatro estados, y cada uno dice algo distinto:
 *   - reposo: quieto
 *   - sugerencia: late despacio, porque hay algo que ofrecer en esta página
 *   - analizando: las barras suben y bajan, hay herramientas trabajando
 *   - respondiendo: pulso rápido, está escribiendo
 */
export type EstadoIcono = "reposo" | "sugerencia" | "analizando" | "respondiendo";

export function IconoNia({ estado = "reposo" }: { estado?: EstadoIcono }) {
  return (
    <svg
      className={`nia-icono nia-icono--${estado}`}
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="nia-barra nia-barra--1" x="1" y="10" width="4" height="7" rx="1" />
      <rect className="nia-barra nia-barra--2" x="7" y="6" width="4" height="11" rx="1" />
      <rect
        className="nia-barra nia-barra--3"
        x="13"
        y="1"
        width="4"
        height="16"
        rx="1"
      />
    </svg>
  );
}

export function Lanzador({
  abierto,
  estado,
  onClick,
}: {
  abierto: boolean;
  estado: EstadoIcono;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="nia-lanzador"
      onClick={onClick}
      aria-expanded={abierto}
      aria-label={abierto ? "Cerrar Nia" : "Abrir Nia, asistente de Infonif"}
    >
      <IconoNia estado={estado} />
      <span className="nia-lanzador__nombre">Nia</span>
      <span className="nia-insignia">BETA</span>
    </button>
  );
}
