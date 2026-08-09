import { TarjetaSegmento } from "@nia/widget";

/**
 * Datos de un segmento real: panaderías en Madrid, consultado contra el API de
 * Infonif. Las cifras del embudo son las de verdad, y por eso el ejemplo enseña
 * lo que tiene que enseñar — que el email se lleva por delante el 94 % del
 * segmento.
 */

const EMBUDO = [
  { criterio: "cnae", etiqueta: "Panadería y pastelería", cantidad: 4016 },
  { criterio: "provincia", etiqueta: "Madrid", cantidad: 582 },
  { criterio: "email", etiqueta: "Con email", cantidad: 36 },
];

export const ConEmbudo = () => (
  <TarjetaSegmento
    datos={{
      empresas: 582,
      embudo: EMBUDO,
      coste: {
        formaDePago: "euros",
        enEuros: { baseImponible: 47.32, total: 57.26 },
      },
    }}
  />
);

/** Con plan: se habla de registros, nunca de euros. Son monedas distintas. */
export const ConPlanDeRegistros = () => (
  <TarjetaSegmento
    datos={{
      empresas: 582,
      embudo: EMBUDO,
      coste: {
        formaDePago: "saldo",
        enSaldo: { registros: 582, alcanza: true, disponiblesDespues: 4418 },
      },
    }}
  />
);

/** Cuando el saldo no llega, se dice, y se dice seco. */
export const SinSaldoSuficiente = () => (
  <TarjetaSegmento
    datos={{
      empresas: 12480,
      embudo: [
        { criterio: "cnae", etiqueta: "Comercio al por mayor", cantidad: 89210 },
        { criterio: "provincia", etiqueta: "Valencia, Castellón", cantidad: 12480 },
      ],
      coste: {
        formaDePago: "saldo",
        enSaldo: { registros: 12480, alcanza: false, disponiblesDespues: 0 },
      },
    }}
  />
);

/** El plan solo se ofrece cuando de verdad sale más barato que el listado suelto. */
export const RecomendandoPlan = () => (
  <TarjetaSegmento
    datos={{
      empresas: 12480,
      embudo: [
        { criterio: "cnae", etiqueta: "Comercio al por mayor", cantidad: 89210 },
        { criterio: "provincia", etiqueta: "Valencia, Castellón", cantidad: 12480 },
        { criterio: "empleados", etiqueta: "Más de 20 empleados", cantidad: 1204 },
      ],
      coste: {
        formaDePago: "euros",
        enEuros: { baseImponible: 312.4, total: 378.0 },
      },
      plan: {
        tramo: { registros: 5000 },
        coste: 250,
        mereceLaPenaParaEsteListado: true,
      },
    }}
  />
);

/** Sin embudo ni precio la tarjeta se sostiene con la cifra sola. */
export const SoloLaCifra = () => <TarjetaSegmento datos={{ empresas: 3689 }} />;
