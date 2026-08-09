import { TarjetaBloqueado } from "@nia/widget";

/** Los productos y precios son los del catálogo público de Infonif. */

export const InformeComercial = () => (
  <TarjetaBloqueado
    datos={{
      producto: "Informe Comercial",
      precio: 15,
      razonSocial: "Mercadona, S.A.",
      motivo:
        "Incluye las cuentas de los tres últimos ejercicios, cargos, vinculaciones y evolución de plantilla.",
    }}
  />
);

export const InformeDeRiesgo = () => (
  <TarjetaBloqueado
    datos={{
      producto: "Informe de Riesgo",
      precio: 30,
      razonSocial: "Transportes Levante Sur, S.A.",
      motivo:
        "Añade scoring y límite de crédito recomendado. Es la única pieza que emite esa valoración: Nia no la da por su cuenta.",
    }}
  />
);

/**
 * Sin precio.
 *
 * Cuando el servidor no manda el importe, la tarjeta **no enseña ninguno**. Es
 * el caso que hay que mirar: mejor sin cifra que con una inventada, que ya pasó
 * una vez.
 */
export const SinPrecio = () => (
  <TarjetaBloqueado
    datos={{
      producto: "Cuentas Anuales",
      razonSocial: "Panificadora Hermanos Ruiz, S.L.",
      motivo: "Depósito íntegro presentado en el Registro Mercantil.",
    }}
  />
);

/** Sin producto identificado, el título cae al genérico. */
export const SinProducto = () => (
  <TarjetaBloqueado
    datos={{
      motivo: "Este dato forma parte de los informes de pago.",
    }}
  />
);
