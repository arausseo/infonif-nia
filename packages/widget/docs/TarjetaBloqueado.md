---
category: Tarjetas
---

# TarjetaBloqueado

Lo que se enseña cuando el usuario no tiene derecho al dato.

**No es un muro con candado.** Es la explicación de qué producto lo daría y
cuánto cuesta. El tono importa: el usuario no ha hecho nada mal, simplemente ese
dato es de pago.

```jsx
<TarjetaBloqueado
  datos={{
    producto: "Informe Comercial",
    precio: 15,
    razonSocial: "Mercadona, S.A.",
    motivo: "Incluye cuentas de los últimos tres ejercicios, cargos y vinculaciones.",
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
| `producto` | `string` | El título. Sin él pone «Requiere compra» |
| `precio` | `number` | Euros sin IVA. **Si no viene, no se pinta ningún precio** |
| `razonSocial` | `string` | Para qué empresa |
| `motivo` | `string` | Qué incluye el producto |

## El precio viene del servidor

Nunca del modelo. Se lo inventó una vez —dijo «unos 5 € + IVA» de un informe de
15 €— y por eso el importe viaja por la tarjeta y no por el texto. Si el servidor
no lo manda, la tarjeta no enseña precio: mejor sin cifra que con una inventada.

El pie es fijo y no se quita: **Nia no cobra, prepara la compra y la confirmas
tú.** El agente nunca ejecuta un cobro.
