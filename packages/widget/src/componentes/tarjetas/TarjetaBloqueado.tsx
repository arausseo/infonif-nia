/**
 * Lo que se enseña cuando el usuario no tiene derecho al dato.
 *
 * No es un muro con candado: es la explicación de qué producto lo daría y
 * cuánto cuesta. El precio viene del servidor —nunca del modelo, que ya se lo
 * inventó una vez— y si no viniera, no se pinta.
 */
export function TarjetaBloqueado({ datos }: { datos: Record<string, unknown> }) {
  const razonSocial = datos["razonSocial"] as string | undefined;
  const producto = datos["producto"] as string | undefined;
  const precio = datos["precio"] as number | undefined;
  const motivo = datos["motivo"] as string | undefined;

  return (
    <article className="nia-tarjeta nia-tarjeta--bloqueado">
      <header>
        <h3 className="nia-tarjeta__titulo">
          {producto ?? "Requiere compra"}
          {typeof precio === "number" && (
            <span className="nia-tarjeta__precio-linea">
              {precio.toLocaleString("es-ES", { minimumFractionDigits: 2 })} € + IVA
            </span>
          )}
        </h3>
        {razonSocial && <p className="nia-tarjeta__nota">Para {razonSocial}</p>}
      </header>

      {motivo && <p className="nia-tarjeta__cuerpo">{motivo}</p>}

      <p className="nia-tarjeta__nota">
        Nia no cobra: prepara la compra y la confirmas tú.
      </p>
    </article>
  );
}
