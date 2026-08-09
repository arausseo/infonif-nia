import { IconoNia, type EstadoIcono } from "@nia/widget";

/**
 * La marca son 18×18 px y las barras se pintan con `currentColor`, así que
 * suelta sobre blanco es un manchurrón diminuto y oscuro que no se ve.
 *
 * Aquí va como se usa de verdad —blanca sobre el violeta de la marca— y
 * ampliada con `scale`, porque el tamaño lo fija el CSS del componente y no se
 * cambia por props.
 */

const Muestra = ({
  estado,
  pie,
  aumento = 4,
}: {
  estado: EstadoIcono;
  pie: string;
  aumento?: number;
}) => (
  <div style={{ minWidth: 240 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: 18 * aumento + 32,
        background: "var(--nia-acento)",
        borderRadius: "var(--nia-radio)",
        color: "#fff",
      }}
    >
      <span style={{ transform: `scale(${aumento})`, transformOrigin: "center" }}>
        <IconoNia estado={estado} />
      </span>
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

export const LaMarca = () => (
  <Muestra
    estado="reposo"
    pie="Una N de tres barras ascendentes que, leídas de otro modo, son un gráfico de crecimiento. Información mercantil."
    aumento={6}
  />
);

export const Reposo = () => <Muestra estado="reposo" pie="Quieto. No pasa nada." />;

export const Sugerencia = () => (
  <Muestra
    estado="sugerencia"
    pie="Late despacio: hay algo que ofrecer en esta página."
  />
);

export const Analizando = () => (
  <Muestra
    estado="analizando"
    pie="Las barras suben y bajan: hay herramientas consultando."
  />
);

export const Respondiendo = () => (
  <Muestra estado="respondiendo" pie="Pulso rápido: está escribiendo la respuesta." />
);

/**
 * Hereda `currentColor`, así que sobre papel se pinta con la tinta del texto.
 * Sirve para menús y listas, no para la marca en grande.
 */
export const SobrePapel = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      border: "1px solid var(--nia-borde)",
      borderRadius: "var(--nia-radio)",
      color: "var(--nia-tinta)",
      minWidth: 200,
    }}
  >
    <IconoNia estado="reposo" />
    <span style={{ fontSize: 15 }}>Preguntar a Nia</span>
  </div>
);
