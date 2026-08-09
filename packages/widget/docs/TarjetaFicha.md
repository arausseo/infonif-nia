---
category: Tarjetas
---

# TarjetaFicha

Una empresa: identificación arriba, magnitudes en tabla debajo.

**Cada cifra lleva su ejercicio al lado, siempre.** No es una convención de
maquetación: si el dato llega sin año, aquí no hay dónde ponerlo, y eso es
intencionado. Una cifra financiera sin ejercicio no significa nada.

```jsx
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
      empleados: { valor: 110000, ejercicio: 2024 },
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
| `razonSocial` | `string` | **Obligatoria.** Sin ella la tarjeta no pinta nada |
| `nif`, `actividad`, `provincia`, `localidad` | `string` | Se juntan en un renglón separado por `·` |
| `magnitudes` | `Record<string, { valor: number, ejercicio: number }>` | Una fila por magnitud |

Claves de magnitud con etiqueta propia: `ventas`, `ebitda`, `resultado`,
`activoTotal`, `patrimonioNeto`, `empleados`. Cualquier otra se pinta con su
clave tal cual.

## Formato de las cifras

A partir de un millón se escriben en millones — `34.059 M€` se lee,
`34059123456` no. `empleados` va siempre en unidades. Todo con separadores
españoles.
