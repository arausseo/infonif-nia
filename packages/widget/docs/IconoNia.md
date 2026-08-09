---
category: Marca
---

# IconoNia

La marca: una N construida con tres barras ascendentes que, leídas de otro modo,
son un gráfico de crecimiento. Es información mercantil — el icono lo dice.

**Los cuatro estados no son decoración, cada uno significa algo:**

| Estado | Qué dice |
|---|---|
| `reposo` | Quieto. No pasa nada. |
| `sugerencia` | Late despacio: hay algo que ofrecer en esta página |
| `analizando` | Las barras suben y bajan: hay herramientas trabajando |
| `respondiendo` | Pulso rápido: está escribiendo la respuesta |

Usar un estado que no corresponde es peor que no animar: el usuario aprende a
leer el icono y luego le miente.

```jsx
<IconoNia estado="analizando" />
```

## Props

| Prop | Tipo | Por defecto |
|---|---|---|
| `estado` | `"reposo" \| "sugerencia" \| "analizando" \| "respondiendo"` | `"reposo"` |

## Color

El acento es violeta (`--nia-acento`) y **no puede ser verde ni rojo** (ADR-010):
en Infonif esos dos colores ya significan solvente y riesgo. El violeta está
reservado a lo que es IA, y no se usa para nada más en el producto.
