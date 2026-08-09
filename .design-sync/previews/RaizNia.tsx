import { LineaDeTiempo, Markdown, RaizNia, TarjetaSegmento } from "@nia/widget";

/**
 * RaizNia no se ve: es la clase de la que cuelgan los tokens y la tipografía.
 * Lo que hay que enseñar entonces no es el componente, sino **lo que pasa
 * dentro de él** — y, en la última celda, lo que pasa fuera.
 */

export const LoQueAporta = () => (
  <RaizNia>
    <div style={{ display: "grid", gap: 4, minWidth: 300 }}>
      <span style={{ fontSize: 13, color: "var(--nia-tinta-tenue)" }}>
        Todo lo de dentro hereda la tipografía y los once tokens
      </span>
      <Markdown texto="Hay **582 panaderías** en Madrid, 120 con cuentas de **2024**." />
    </div>
  </RaizNia>
);

/** Un turno entero de la conversación, que es lo que suele contener. */
export const UnTurnoCompleto = () => (
  <RaizNia>
    <div style={{ display: "grid", gap: 12, minWidth: 340 }}>
      <LineaDeTiempo
        turno={{
          id: "t1",
          texto: "",
          tarjetas: [],
          enCurso: false,
          duracion: 12100,
          pasos: [
            {
              id: "s1",
              texto: "Interpretando la actividad",
              detalle: "CNAE 1071, 1072",
              estado: "ok",
              desde: 0,
            },
            {
              id: "s2",
              texto: "Contando el segmento",
              detalle: "582 empresas",
              estado: "ok",
              desde: 0,
            },
          ],
        }}
      />
      <Markdown texto="Hay **582 panaderías** en Madrid. ¿Quieres el listado?" />
      <TarjetaSegmento
        datos={{
          empresas: 582,
          coste: {
            formaDePago: "euros",
            enEuros: { baseImponible: 47.32, total: 57.26 },
          },
        }}
      />
    </div>
  </RaizNia>
);

/**
 * Los once tokens que declara.
 *
 * Es la paleta entera del producto: no hay más colores que estos. El acento es
 * violeta y **no puede ser verde ni rojo** — en Infonif esos dos ya significan
 * solvente y riesgo, y el violeta está reservado a lo que es IA.
 */
const TOKENS = [
  ["--nia-acento", "#6246ea"],
  ["--nia-acento-suave", "#eee9ff"],
  ["--nia-tinta", "#14161f"],
  ["--nia-tinta-suave", "#5b6072"],
  ["--nia-tinta-tenue", "#8b90a3"],
  ["--nia-papel", "#ffffff"],
  ["--nia-papel-suave", "#f7f7fb"],
  ["--nia-borde", "#e3e5ee"],
  ["--nia-error", "#b3261e"],
];

export const LosTokens = () => (
  <RaizNia>
    <div style={{ display: "grid", gap: 6, minWidth: 320 }}>
      {TOKENS.map(([nombre, valor]) => (
        <div key={nombre} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: `var(${nombre})`,
              border: "1px solid var(--nia-borde)",
              flex: "none",
            }}
          />
          <code style={{ fontSize: 12.5, color: "var(--nia-tinta)" }}>{nombre}</code>
          <span
            style={{ fontSize: 12, color: "var(--nia-tinta-tenue)", marginLeft: "auto" }}
          >
            {valor}
          </span>
        </div>
      ))}
      <p
        style={{
          margin: "6px 0 0",
          fontSize: 12.5,
          lineHeight: 1.45,
          color: "var(--nia-tinta-suave)",
        }}
      >
        Faltan dos que no son color: <code>--nia-radio</code> (14px) y{" "}
        <code>--nia-sombra</code>. Todos cuelgan de <code>.nia-raiz</code>: fuera de
        ella no resuelven.
      </p>
    </div>
  </RaizNia>
);
