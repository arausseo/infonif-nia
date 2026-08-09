---
category: Conversacion
---

# Markdown

Renderiza la respuesta del agente. Markdown mínimo y propio: párrafos, listas,
títulos, negrita, cursiva y código.

**Devuelve elementos de React, nunca HTML.** No hay `dangerouslySetInnerHTML` en
ninguna parte, y eso es deliberado: el texto lo ha escrito un modelo de lenguaje.
Lo que no entiende lo deja como texto plano — es preferible enseñar un asterisco
de más que tragarse una etiqueta.

```jsx
<Markdown texto={`Hay **582 panaderías** en Madrid.

He contado con estos códigos:
- **1071** — Pan y productos frescos
- **1072** — Galletas y larga duración

Ventas medias de 412.000 € en 2024.`} />
```

## Props

| Prop | Tipo | |
|---|---|---|
| `texto` | `string` | Markdown en crudo |

## Se transmite a medias, a propósito

Mientras llega la respuesta, `texto` crece token a token, así que constantemente
recibe markdown sin cerrar (`**sin cerrar`). No casa con nada y se muestra tal
cual, sin romper el layout. Al llegar el asterisco que falta, se convierte en
negrita. Cualquier maqueta de un mensaje a medio escribir puede pasar texto
cortado sin miedo.

En el widget el repintado va limitado a 50 ms, no a cada token.
