---
category: Base
---

# RaizNia

El contenedor del que cuelga todo lo demás. **Ningún componente de Nia se usa
suelto: van todos dentro de esta raíz.**

Los tokens (`--nia-acento`, `--nia-tinta`, `--nia-papel`…) y la familia
tipográfica están declarados en `.nia-raiz`, que es la clase que pinta este
componente. Un componente fuera de ella sale con la tipografía del navegador y
sin ningún color de la marca — no falla, sale feo, que es peor porque no se nota.

En el widget embebido lo crea `montar()` dentro del Shadow DOM. En cualquier otro
sitio hay que ponerlo a mano.

```jsx
<RaizNia>
  <Markdown texto="**582 empresas** en Madrid." />
</RaizNia>
```

## Props

| Prop | Tipo | |
|---|---|---|
| `children` | `ReactNode` | Lo que va dentro |

## Por qué existe

El widget vive dentro de un Shadow DOM (ADR-006) porque se inyecta en páginas
ASP con años de CSS encima. Ahí los tokens se declaran en `:host`. Pero `:host`
no existe fuera de un shadow root, así que se declaran también en `.nia-raiz` —
y este componente es esa clase, hecha componente.
