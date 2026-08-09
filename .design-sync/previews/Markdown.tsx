import { Markdown } from "@nia/widget";

/**
 * Texto real del agente, no lorem ipsum: es lo que hay que mirar para juzgar la
 * tipografía, el interlineado y el ritmo de los párrafos.
 */

export const Respuesta = () => (
  <Markdown
    texto={`Hay **582 panaderías** en Madrid.

He contado con estos códigos CNAE:

- **1071** — Fabricación de pan y productos frescos de panadería y pastelería
- **1072** — Fabricación de galletas y productos de larga duración

De esas, 120 tienen cuentas depositadas del ejercicio **2024**. Las ventas
medianas del grupo fueron de 412.000 € ese año.

¿Quieres el listado con algún campo en concreto?`}
  />
);

export const ConTitulosYTabla = () => (
  <Markdown
    texto={`## Campos financieros disponibles

Todos para los mismos 120 registros:

1. Ventas — 0,04 €/registro
2. EBITDA — 0,05 €/registro
3. Resultado del ejercicio — 0,05 €/registro

El código \`99016\` es el EBITDA. Ojo: \`99022\` es *Apalancamiento*, no el
resultado, aunque lo parezca.`}
  />
);

/**
 * Lo que se ve mientras llega la respuesta.
 *
 * El markdown a medias es el estado NORMAL durante la transmisión, no un caso
 * raro: `**Mercadona` sin cerrar no casa con nada y se pinta tal cual, sin
 * romper el layout. Cuando llegan los dos asteriscos que faltan, se convierte
 * en negrita de golpe.
 */
export const EnTransmision = () => (
  <Markdown
    texto={`Las ventas de **Mercadona, S.A.** en 2024 fueron de 34.059 M€, un
9,4 % más que el ejercicio anterior. El EBITDA se situó en **1.7`}
  />
);
