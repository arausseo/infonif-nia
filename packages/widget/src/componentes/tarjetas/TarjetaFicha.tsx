interface Magnitud {
  valor: number;
  ejercicio: number;
}

const ETIQUETAS: Record<string, string> = {
  ventas: "Ventas",
  ebitda: "EBITDA",
  resultado: "Resultado",
  activoTotal: "Activo total",
  patrimonioNeto: "Patrimonio neto",
  empleados: "Empleados",
};

/** Millones cuando la cifra es grande: 34.059 M€ se lee; 34059123456 no. */
function importe(clave: string, valor: number): string {
  if (clave === "empleados") return valor.toLocaleString("es-ES");
  if (Math.abs(valor) >= 1_000_000) {
    return `${(valor / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M€`;
  }
  return `${valor.toLocaleString("es-ES", { maximumFractionDigits: 0 })} €`;
}

/**
 * Ficha de una empresa.
 *
 * Cada cifra se pinta con su ejercicio al lado, siempre. La regla 4 no es solo
 * una instrucción para el modelo: si el dato llega sin año, aquí no hay dónde
 * ponerlo, y eso es intencionado.
 */
export function TarjetaFicha({ datos }: { datos: Record<string, unknown> }) {
  const razonSocial = datos["razonSocial"] as string | undefined;
  const nif = datos["nif"] as string | undefined;
  const actividad = datos["actividad"] as string | undefined;
  const provincia = datos["provincia"] as string | undefined;
  const localidad = datos["localidad"] as string | undefined;
  const magnitudes = (datos["magnitudes"] as Record<string, Magnitud> | undefined) ?? {};

  if (!razonSocial) return null;

  const filas = Object.entries(magnitudes).filter(
    ([, m]) => m && typeof m.valor === "number",
  );

  return (
    <article className="nia-tarjeta">
      <header>
        <h3 className="nia-tarjeta__titulo">{razonSocial}</h3>
        <p className="nia-tarjeta__nota">
          {[nif, actividad, [localidad, provincia].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>

      {filas.length > 0 && (
        <table className="nia-magnitudes">
          <tbody>
            {filas.map(([clave, magnitud]) => (
              <tr key={clave}>
                <th scope="row">{ETIQUETAS[clave] ?? clave}</th>
                <td>{importe(clave, magnitud.valor)}</td>
                <td className="nia-magnitudes__ejercicio">{magnitud.ejercicio}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </article>
  );
}
