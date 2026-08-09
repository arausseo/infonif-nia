import { Tarjetas } from "@nia/widget";

/**
 * El registro. Lo que hay que ver aquí no es una tarjeta bonita —para eso están
 * las suyas— sino **cómo se comporta el despachador**: que reparte por tipo,
 * que apila, y que un tipo que no conoce lo ignora sin caerse.
 */

export const UnaSola = () => (
  <Tarjetas
    tarjetas={[
      {
        tipo: "segmento",
        clave: "segmento",
        datos: {
          empresas: 582,
          embudo: [
            { criterio: "cnae", etiqueta: "Panadería y pastelería", cantidad: 4016 },
            { criterio: "provincia", etiqueta: "Madrid", cantidad: 582 },
          ],
          coste: {
            formaDePago: "euros",
            enEuros: { baseImponible: 47.32, total: 57.26 },
          },
        },
      },
    ]}
  />
);

/** Varias en un turno: se apilan en el orden en que llegaron. */
export const VariasApiladas = () => (
  <Tarjetas
    tarjetas={[
      {
        tipo: "ficha",
        datos: {
          razonSocial: "Panificadora Hermanos Ruiz, S.L.",
          nif: "B28451920",
          provincia: "Madrid",
          localidad: "Getafe",
          magnitudes: { ventas: { valor: 412000, ejercicio: 2024 } },
        },
      },
      {
        tipo: "bloqueado",
        datos: {
          producto: "Informe de Riesgo",
          precio: 30,
          motivo: "Incluye scoring y límite de crédito recomendado.",
        },
      },
    ]}
  />
);

/**
 * Un tipo que este widget no conoce.
 *
 * `confirmacion` llegará con la compra. Un widget desplegado hoy lo ignora y
 * pinta el resto — **no se cae**. Importa porque el widget vive embebido en el
 * portal y no se actualiza a la vez que el servidor.
 */
export const ConUnTipoDesconocido = () => (
  <Tarjetas
    tarjetas={[
      { tipo: "confirmacion", datos: { sku: "INF_RIESGO", importe: 30 } },
      {
        tipo: "segmento",
        datos: { empresas: 3689 },
      },
    ]}
  />
);
