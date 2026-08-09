---
category: Tarjetas
---

# Tarjetas

El registro. Recibe la lista de tarjetas de un turno y pinta cada una con el
componente que le toca según su `tipo`.

**Un tipo desconocido no rompe nada: no se pinta.** Si mañana el servidor manda
una tarjeta nueva, un widget viejo la ignora en lugar de caerse. Esto importa
porque el widget vive embebido y no se actualiza a la vez que el servidor.

```jsx
<Tarjetas
  tarjetas={[
    { tipo: "segmento", clave: "segmento", datos: { empresas: 582 } },
  ]}
/>
```

## Props

| Prop | Tipo | |
|---|---|---|
| `tarjetas` | `Tarjeta[]` | Con la lista vacía no pinta nada |

Una tarjeta es `{ tipo, clave?, datos }`. Tipos con componente hoy: `segmento`,
`ficha`, `bloqueado`. (`confirmacion` llega con la compra.)

## La clave

Dos tarjetas con la misma `clave` **son la misma**: la segunda reemplaza a la
primera en su sitio. Sin esto, un turno donde el agente cuenta un segmento y
luego lo cotiza dejaba dos tarjetas con dos precios distintos, y el usuario no
sabía cuál valía.

## Por qué las tarjetas pueden llevar cifras

Llegan por un canal que **no pasa por el contexto del modelo**. Por eso se pueden
enseñar números y tablas sin pagarlos en tokens y sin arriesgarse a que el modelo
los reescriba mal — que es exactamente lo que hizo una vez con un precio.
