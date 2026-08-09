---
category: Conversacion
---

# Sugerencias

La pantalla vacía. Tres preguntas para empezar, **elegidas según dónde esté el
usuario en el portal**.

No es relleno: en una ficha de empresa la pregunta útil ya la sabe el sistema, y
obligar a escribirla entera es fricción. En la portada no se sabe nada, y
entonces se ofrecen los tres caminos del producto — un listado, una consulta de
riesgo, una de mercado.

```jsx
<Sugerencias
  contexto={{ tipo: "ficha", razonSocial: "Mercadona, S.A.", nif: "A46103834" }}
  onElegir={(texto) => enviar(texto)}
/>
```

## Props

| Prop | Tipo | |
|---|---|---|
| `contexto` | `ContextoPagina` (opcional) | Dónde está el usuario. Sin él, salen las genéricas |
| `onElegir` | `(texto: string) => void` | Se llama con la sugerencia pulsada, ya enviada tal cual |

## Qué ofrece en cada página

| `contexto.tipo` | Qué propone |
|---|---|
| `ficha` | Sobre esa empresa: último ejercicio, quién la administra, parecidas en la zona |
| `busqueda` | Sobre el término buscado: cuántas hay, con más de 10 empleados, qué informe conviene |
| `listado` | Afinar, cuánto costaría descargarlo, si compensa un plan |
| `ranking` | Quién lidera, el sector en mi provincia, qué datos se pueden descargar |
| sin contexto | Las tres genéricas |

La función `sugerenciasDe(contexto)` está exportada aparte si quieres las cadenas
sin el componente.
