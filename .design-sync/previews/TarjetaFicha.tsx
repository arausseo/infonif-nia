import { TarjetaFicha } from "@nia/widget";

/**
 * Cifras reales de Infonif, con su ejercicio. Ninguna magnitud se pinta sin año
 * — si el dato llega sin él, la tarjeta no tiene dónde ponerlo, y eso es
 * deliberado.
 */

export const EmpresaGrande = () => (
  <TarjetaFicha
    datos={{
      razonSocial: "Mercadona, S.A.",
      nif: "A46103834",
      actividad: "Comercio al por menor en establecimientos no especializados",
      provincia: "Valencia",
      localidad: "Tavernes Blanques",
      magnitudes: {
        ventas: { valor: 34059000000, ejercicio: 2024 },
        ebitda: { valor: 1710000000, ejercicio: 2024 },
        resultado: { valor: 1384000000, ejercicio: 2024 },
        empleados: { valor: 110000, ejercicio: 2024 },
      },
    }}
  />
);

/** Lo habitual en la base: una pyme con cuentas modestas. */
export const Pyme = () => (
  <TarjetaFicha
    datos={{
      razonSocial: "Panificadora Hermanos Ruiz, S.L.",
      nif: "B28451920",
      actividad: "Fabricación de pan y productos frescos de panadería",
      provincia: "Madrid",
      localidad: "Getafe",
      magnitudes: {
        ventas: { valor: 412000, ejercicio: 2024 },
        ebitda: { valor: 38400, ejercicio: 2024 },
        empleados: { valor: 11, ejercicio: 2024 },
      },
    }}
  />
);

/**
 * Sin cuentas depositadas: identificación y nada más.
 *
 * No es un caso raro — la mayoría de las empresas del índice están así, y la
 * tarjeta tiene que sostenerse sin la tabla.
 */
export const SinCuentas = () => (
  <TarjetaFicha
    datos={{
      razonSocial: "Obrador de Chamberí, S.L.U.",
      nif: "B87334102",
      actividad: "Fabricación de pan y productos frescos de panadería",
      provincia: "Madrid",
      localidad: "Madrid",
    }}
  />
);

/** Ejercicios distintos en la misma tabla: cada cifra lleva el suyo. */
export const EjerciciosMezclados = () => (
  <TarjetaFicha
    datos={{
      razonSocial: "Transportes Levante Sur, S.A.",
      nif: "A46778201",
      actividad: "Transporte de mercancías por carretera",
      provincia: "Valencia",
      localidad: "Silla",
      magnitudes: {
        ventas: { valor: 8940000, ejercicio: 2024 },
        activoTotal: { valor: 6120000, ejercicio: 2023 },
        patrimonioNeto: { valor: 2380000, ejercicio: 2023 },
      },
    }}
  />
);
