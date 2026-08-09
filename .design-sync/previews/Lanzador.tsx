import type { ReactNode } from "react";
import { Lanzador } from "@nia/widget";

/**
 * Los cuatro estados se distinguen SOLO por la animación del icono, así que en
 * una captura estática salen idénticos. Cada celda lleva debajo qué hace el
 * suyo — si no, esto sería la misma píldora cinco veces y no diría nada.
 *
 * El componente lleva `position: fixed` para ganarle a cualquier cosa del
 * portal, y dentro de una tarjeta se escaparía a la esquina de la ventana.
 * `transform` en un ancestro crea un bloque contenedor para los descendientes
 * `fixed`: pasan a anclarse a él. Es el modo de enseñarlo en su sitio sin tocar
 * el componente.
 */
const Marco = ({ pie, children }: { pie: string; children: ReactNode }) => (
  <div style={{ minWidth: 260 }}>
    <div
      style={{
        transform: "translateZ(0)",
        position: "relative",
        height: 88,
        background: "var(--nia-papel-suave)",
        borderRadius: "var(--nia-radio)",
        border: "1px solid var(--nia-borde)",
      }}
    >
      {children}
    </div>
    <p
      style={{
        margin: "8px 2px 0",
        fontSize: 13,
        lineHeight: 1.4,
        color: "var(--nia-tinta-suave)",
      }}
    >
      {pie}
    </p>
  </div>
);

export const Reposo = () => (
  <Marco pie="Quieto. No pasa nada.">
    <Lanzador abierto={false} estado="reposo" onClick={() => {}} />
  </Marco>
);

export const Sugerencia = () => (
  <Marco pie="Late despacio: hay algo que ofrecer en esta página.">
    <Lanzador abierto={false} estado="sugerencia" onClick={() => {}} />
  </Marco>
);

export const Analizando = () => (
  <Marco pie="Las barras suben y bajan: hay herramientas consultando.">
    <Lanzador abierto={false} estado="analizando" onClick={() => {}} />
  </Marco>
);

export const Respondiendo = () => (
  <Marco pie="Pulso rápido: está escribiendo la respuesta.">
    <Lanzador abierto={false} estado="respondiendo" onClick={() => {}} />
  </Marco>
);

export const CajonAbierto = () => (
  <Marco pie="Con abierto={true} el botón no desaparece: es el mismo control para cerrar. Solo cambia su etiqueta accesible.">
    <Lanzador abierto estado="reposo" onClick={() => {}} />
  </Marco>
);
