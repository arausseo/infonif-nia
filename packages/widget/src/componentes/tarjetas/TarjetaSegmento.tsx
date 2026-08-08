const numero = (n: unknown): string =>
  typeof n === "number" ? n.toLocaleString("es-ES") : "—";

const euros = (n: unknown): string =>
  typeof n === "number"
    ? `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
    : "—";

interface PasoEmbudo {
  criterio: string;
  etiqueta: string;
  cantidad: number;
}

/**
 * El resultado de un segmento: cuántas empresas, el embudo y lo que cuesta.
 *
 * El embudo es lo más útil de toda la tarjeta: enseña en qué criterio se cae el
 * segmento, que es justo lo que el usuario necesita para decidir qué aflojar.
 */
export function TarjetaSegmento({ datos }: { datos: Record<string, unknown> }) {
  const empresas = datos["empresas"];
  const embudo = (datos["embudo"] as PasoEmbudo[] | undefined) ?? [];
  const coste = datos["coste"] as
    | {
        formaDePago: "euros" | "saldo";
        enEuros?: { total: number; baseImponible: number };
        enSaldo?: { registros: number; alcanza: boolean; disponiblesDespues: number };
      }
    | undefined;
  const plan = datos["plan"] as
    | {
        tramo: { registros: number };
        coste: number;
        mereceLaPenaParaEsteListado: boolean;
      }
    | undefined;

  const maximo = Math.max(...embudo.map((p) => p.cantidad), 1);

  return (
    <article className="nia-tarjeta">
      <header className="nia-tarjeta__cabecera">
        <span className="nia-tarjeta__cifra">{numero(empresas)}</span>
        <span className="nia-tarjeta__unidad">empresas</span>
      </header>

      {embudo.length > 0 && (
        <ul className="nia-embudo">
          {embudo.map((paso) => (
            <li key={paso.criterio} className="nia-embudo__paso">
              <span className="nia-embudo__etiqueta">{paso.etiqueta}</span>
              <span className="nia-embudo__barra" aria-hidden="true">
                <span style={{ width: `${(paso.cantidad / maximo) * 100}%` }} />
              </span>
              <span className="nia-embudo__valor">{numero(paso.cantidad)}</span>
            </li>
          ))}
        </ul>
      )}

      {coste?.formaDePago === "saldo" && coste.enSaldo && (
        <p className="nia-tarjeta__precio">
          Consume <strong>{numero(coste.enSaldo.registros)} registros</strong> de tu saldo
          {coste.enSaldo.alcanza
            ? `, quedarían ${numero(coste.enSaldo.disponiblesDespues)}.`
            : ". No te llegan."}
        </p>
      )}

      {coste?.formaDePago === "euros" && coste.enEuros && (
        <p className="nia-tarjeta__precio">
          <strong>{euros(coste.enEuros.total)}</strong> con IVA
          <span className="nia-tarjeta__nota">
            {" "}
            ({euros(coste.enEuros.baseImponible)} + IVA)
          </span>
        </p>
      )}

      {plan?.mereceLaPenaParaEsteListado && (
        <p className="nia-tarjeta__nota">
          Un plan de {numero(plan.tramo.registros)} registros ({euros(plan.coste)}) te
          saldría más barato.
        </p>
      )}
    </article>
  );
}
