---
category: Tarjetas
---

# TarjetaSegmento

El resultado de un segmento: cuántas empresas, dónde se cae el conteo y lo que
cuesta.

**El embudo es lo más útil de la tarjeta.** Enseña en qué criterio se desploma el
segmento, que es justo lo que el usuario necesita para decidir qué aflojar: si
582 empresas se quedan en 36 al exigir email, el problema es el email, no el
sector.

```jsx
<TarjetaSegmento
  datos={{
    empresas: 582,
    embudo: [
      { criterio: "cnae", etiqueta: "Panadería y pastelería", cantidad: 4016 },
      { criterio: "provincia", etiqueta: "Madrid", cantidad: 582 },
      { criterio: "email", etiqueta: "Con email", cantidad: 36 },
    ],
    coste: {
      formaDePago: "euros",
      enEuros: { baseImponible: 47.32, total: 57.26 },
    },
  }}
/>
```

## Props

| Prop | Tipo | |
|---|---|---|
| `datos` | `Record<string, unknown>` | Bolsa sin tipar. La forma real está abajo |

### `datos`

| Clave | Forma | |
|---|---|---|
| `empresas` | `number` | La cifra grande de la cabecera |
| `embudo` | `{ criterio, etiqueta, cantidad }[]` | Un renglón con barra por criterio. La barra se escala al mayor |
| `coste.formaDePago` | `"euros" \| "saldo"` | Decide qué línea de precio se pinta |
| `coste.enEuros` | `{ baseImponible, total }` | Con `formaDePago: "euros"` |
| `coste.enSaldo` | `{ registros, alcanza, disponiblesDespues }` | Con `formaDePago: "saldo"` |
| `plan` | `{ tramo: { registros }, coste, mereceLaPenaParaEsteListado }` | Solo se pinta si `mereceLaPenaParaEsteListado` |

Todo es opcional salvo `empresas`. Sin embudo, sin coste o sin plan, esas partes
simplemente no aparecen — la tarjeta se sostiene con la cifra sola.

## Dos formas de pagar que no se mezclan

Sin plan se paga **por campo y por registro**, más IVA. Con plan de registros se
consume **un registro por empresa** y los campos dan igual. Nunca enseñes euros y
registros en la misma tarjeta: son monedas distintas y no convierten.
