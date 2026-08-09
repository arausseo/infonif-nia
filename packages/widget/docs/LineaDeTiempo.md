---
category: Conversacion
---

# LineaDeTiempo

Los pasos que va dando el agente mientras trabaja. **Es el diferenciador del
producto**, no un spinner con adornos: el usuario ve qué está consultando y por
qué tarda, y eso convierte una espera de doce segundos en algo que se puede
mirar.

Tres estados, y se gobiernan solos a partir del turno:

| Estado | Cómo se ve |
|---|---|
| `durante` | Expandida, con el paso en curso girando. No se puede plegar |
| `hecho` | Plegada a «3 pasos · 1,2 s», con chevron para volver a abrirla |
| `error` | Abierta y así se queda, para que se vea dónde se rompió |

```jsx
<LineaDeTiempo
  turno={{
    id: "t1",
    texto: "",
    enCurso: true,
    tarjetas: [],
    pasos: [
      { id: "s1", texto: "Interpretando la actividad", estado: "ok",
        detalle: "CNAE 1071, 1072", desde: 0 },
      { id: "s2", texto: "Contando el segmento", estado: "activo", desde: 0 },
    ],
  }}
/>
```

## Props

| Prop | Tipo | |
|---|---|---|
| `turno` | `Turno` | El turno entero. Lee `pasos` y `enCurso` |

Un paso es `{ id, texto, estado: "activo" | "ok" | "error", detalle?, desde }`.
El `detalle` es el resultado en corto — «582 empresas», «CNAE 1071, 1072» — y es
lo que hace que la línea informe en vez de entretener.

Con `pasos` vacío no pinta nada.

## Dos decisiones que no hay que deshacer

**Sin animación de salida.** Animar el plegado produce saltos de layout justo
mientras el texto se está transmitiendo debajo. Un cambio seco se ve mejor.

**Los pasos no llevan `aria-live`.** Un lector de pantalla que cante cinco
cambios de estado seguidos es inservible. Lo que se anuncia es la respuesta.
