# Nia — cómo construir con estos componentes

Nia es el agente conversacional de **Infonif**, un portal español de información
mercantil. Estos diez componentes son los del widget que se embebe en el portal.
Todo está en español: nombres, props y contenido.

## 1. Envuelve siempre en `RaizNia`

**Sin esto no hay estilo.** Los once tokens y la tipografía cuelgan de la clase
`.nia-raiz`, que es lo único que pinta `RaizNia`. Un componente fuera de esa raíz
sale con la fuente del navegador y con `var(--nia-*)` sin resolver — no falla,
sale roto, que se nota menos y es peor.

```jsx
import { RaizNia, Markdown, TarjetaSegmento } from '@nia/widget'

<RaizNia>
  <Markdown texto="Hay **582 panaderías** en Madrid." />
  <TarjetaSegmento datos={{ empresas: 582 }} />
</RaizNia>
```

No hace falta nada más: ni tema, ni contexto, ni proveedor. `RaizNia` es todo el
andamiaje que existe.

## 2. El idioma de estilo: tokens y BEM, nunca utilidades

**No hay Tailwind ni ninguna otra librería de utilidades** (decisión ADR-006: el
widget vive en un Shadow DOM y las utilidades globales no lo cruzan). Escribir
`class="bg-slate-100 p-4"` aquí no pinta absolutamente nada.

Para maquetar alrededor de los componentes, usa **estilos en línea o CSS propio
con los tokens**:

| Token | Valor | Para qué |
|---|---|---|
| `--nia-acento` | `#6246ea` | Violeta de marca. **Reservado a lo que es IA** |
| `--nia-acento-suave` | `#eee9ff` | Fondo de lo que es IA (tarjeta bloqueada) |
| `--nia-tinta` | `#14161f` | Texto principal |
| `--nia-tinta-suave` | `#5b6072` | Texto secundario |
| `--nia-tinta-tenue` | `#8b90a3` | Texto terciario, unidades, notas |
| `--nia-papel` | `#ffffff` | Fondo |
| `--nia-papel-suave` | `#f7f7fb` | Fondo de bloque (pasos, marcos) |
| `--nia-borde` | `#e3e5ee` | Bordes de todo |
| `--nia-error` | `#b3261e` | Solo errores |
| `--nia-radio` | `14px` | Radio de esquina de todo lo que es caja |
| `--nia-sombra` | `0 8px 30px rgba(20,22,31,.16)` | La única sombra |

**El acento no puede ser verde ni rojo** (ADR-010). En Infonif el verde ya
significa solvente y el rojo, riesgo. El violeta está reservado a lo que es IA y
no se usa para nada más.

Las clases internas son BEM con prefijo `nia-` (`.nia-tarjeta`,
`.nia-tarjeta__cifra`, `.nia-pasos--error`) — 56 en total. **Son internas: no las
escribas ni las sobreescribas.** Están en `_ds_bundle.css` si necesitas mirarlas.

## 3. Dónde está la verdad

- **`styles.css`** y lo que importa (`_ds_bundle.css`) — el CSS real, con los
  tokens y las 56 clases.
- **`components/<grupo>/<Nombre>/<Nombre>.prompt.md`** — la documentación de cada
  componente, con la forma exacta de sus datos y sus casos límite. **Léela antes
  de componer una tarjeta**: las tres tarjetas reciben `datos: Record<string,
  unknown>`, así que el `.d.ts` no dice nada útil y la forma real solo está ahí.

## 4. Los grupos

| Grupo | Componentes |
|---|---|
| `base` | `RaizNia` |
| `marca` | `IconoNia`, `Lanzador` |
| `conversacion` | `LineaDeTiempo`, `Markdown`, `Sugerencias` |
| `tarjetas` | `Tarjetas`, `TarjetaSegmento`, `TarjetaFicha`, `TarjetaBloqueado` |

## 5. Tres cosas que cuestan un ciclo de depuración

**`Lanzador` lleva `position: fixed`** con `z-index: 2147483000`, para ganarle a
cualquier CSS del portal. Dentro de una maqueta se escapa a la esquina de la
ventana. Ancla el bloque contenedor con `transform: translateZ(0)` en un padre:

```jsx
<div style={{ transform: 'translateZ(0)', position: 'relative', height: 88 }}>
  <Lanzador abierto={false} estado="sugerencia" onClick={() => {}} />
</div>
```

**Los cuatro estados de `IconoNia` se distinguen solo por la animación.** En una
imagen fija salen idénticos. Si haces una maqueta estática, rotula cuál es cuál o
no dirá nada.

**`IconoNia` mide 18×18 px fijos** y se pinta con `currentColor`. El tamaño lo
fija el CSS, no hay prop: para agrandarlo, `transform: scale(n)` en un envoltorio.

## 6. Cómo suena Nia

Si escribes texto para una maqueta, imítalo o desentonará:

- Español de España, segunda persona, frases cortas. Nada de «¡Genial!».
- **Toda cifra financiera lleva su ejercicio**: «34.059 M€ en 2024», nunca «unos
  34.000 millones».
- **Ningún precio sin fuente.** Los importes vienen del servidor por la tarjeta,
  nunca del texto.
- Nia **no cobra** — prepara la compra y la confirma el usuario.
- Nia **no valora el riesgo ni el crédito** de nadie. Eso lo produce el Informe
  de Riesgo, que es un producto de pago.

## 7. Un ejemplo completo

```jsx
import { RaizNia, LineaDeTiempo, Markdown, TarjetaSegmento } from '@nia/widget'

<RaizNia>
  <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
    <LineaDeTiempo turno={{
      id: 't1', texto: '', tarjetas: [], enCurso: false, duracion: 12100,
      pasos: [
        { id: 's1', texto: 'Interpretando la actividad',
          detalle: 'CNAE 1071, 1072', estado: 'ok', desde: 0 },
        { id: 's2', texto: 'Contando el segmento',
          detalle: '582 empresas', estado: 'ok', desde: 0 },
      ],
    }} />

    <Markdown texto="Hay **582 panaderías** en Madrid, 120 con cuentas de **2024**." />

    <TarjetaSegmento datos={{
      empresas: 582,
      embudo: [
        { criterio: 'cnae', etiqueta: 'Panadería y pastelería', cantidad: 4016 },
        { criterio: 'provincia', etiqueta: 'Madrid', cantidad: 582 },
        { criterio: 'email', etiqueta: 'Con email', cantidad: 36 },
      ],
      coste: { formaDePago: 'euros', enEuros: { baseImponible: 47.32, total: 57.26 } },
    }} />
  </div>
</RaizNia>
```
